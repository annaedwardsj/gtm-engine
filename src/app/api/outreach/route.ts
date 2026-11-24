import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { ICP } from "@/types/icp";
import { CompanyMatch } from "@/types/company";
import { Contact, Lead } from "@/types/lead";
import { saveLeads, graphErrorMessage } from "@/lib/graph";
import { randomUUID } from "node:crypto";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ---------- Hunter ----------

interface HunterEmail {
  value: string;
  first_name: string | null;
  last_name: string | null;
  position: string | null;
  seniority: string | null;
  confidence: number | null;
  verification?: { status: string | null } | null;
}

class HunterError extends Error {}

async function hunterDomainSearch(company: CompanyMatch, seniorOnly: boolean): Promise<HunterEmail[]> {
  const params = new URLSearchParams({
    api_key: process.env.HUNTER_API_KEY ?? "",
    type: "personal",
    limit: "10",
  });
  params.set("domain", company.domain ?? "");
  if (seniorOnly) params.set("seniority", "senior,executive");

  const res = await fetch(`https://api.hunter.io/v2/domain-search?${params}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data?.errors?.[0]?.details ?? res.statusText;
    if (res.status === 401) throw new HunterError("Hunter API key rejected");
    if (res.status === 429 || res.status === 403) throw new HunterError(`Hunter limit reached (${detail})`);
    throw new HunterError(`Hunter error ${res.status}: ${detail}`);
  }
  return data?.data?.emails ?? [];
}

const STOPWORDS = new Set(["of", "and", "the", "&", "-", "head"]);
const words = (s: string) =>
  s.toLowerCase().split(/[^a-z]+/).filter((w) => w && !STOPWORDS.has(w));

/** The ICP buyer persona a Hunter contact's job title best overlaps, and how well (0 = no overlap). */
function bestPersona(e: HunterEmail, icp: ICP): { title: string | null; score: number } {
  if (!e.position) return { title: null, score: 0 };
  const pos = new Set(words(e.position));
  let best = { title: null as string | null, score: 0 };
  for (const bt of icp.buyerTitles) {
    const tw = words(bt.title);
    const score = (tw.filter((w) => pos.has(w)).length / Math.max(tw.length, 1)) * bt.confidence;
    if (score > best.score) best = { title: bt.title, score };
  }
  return best;
}

const personaMatch = (e: HunterEmail, icp: ICP) => bestPersona(e, icp).score;

function personaScore(e: HunterEmail, icp: ICP): number {
  const seniorityBonus = e.seniority === "executive" ? 0.15 : e.seniority === "senior" ? 0.1 : 0;
  const verifiedBonus = e.verification?.status === "valid" ? 0.05 : 0;
  return personaMatch(e, icp) + seniorityBonus + verifiedBonus;
}

/** A decision-maker either matches a buyer persona by title or is an executive. */
const isDecisionMaker = (e: HunterEmail, icp: ICP) => personaMatch(e, icp) > 0 || e.seniority === "executive";

function toContact(e: HunterEmail, icp: ICP): Contact {
  return {
    name: [e.first_name, e.last_name].filter(Boolean).join(" ") || e.value.split("@")[0],
    title: e.position ?? "Unknown title",
    email: e.value,
    verification: e.verification?.status ?? null,
    confidence: e.confidence,
    source: "hunter",
    persona: bestPersona(e, icp).title,
  };
}

const SAMPLE_NAMES = ["Jordan Lee", "Sam Patel", "Alex Rivera", "Taylor Chen", "Morgan Brooks", "Casey Nguyen", "Riley Okafor", "Jamie Fischer"];

function sampleContact(icp: ICP, index: number, reason: string): Contact {
  const name = SAMPLE_NAMES[index % SAMPLE_NAMES.length];
  const title = [...icp.buyerTitles].sort((a, b) => b.confidence - a.confidence)[index % icp.buyerTitles.length]?.title ?? "Head of Sales";
  return {
    name,
    title,
    email: `${name.toLowerCase().replace(" ", ".")}@example.com`,
    verification: null,
    confidence: null,
    source: "sample",
    persona: title,
    sampleReason: reason,
  };
}

async function findContact(company: CompanyMatch, icp: ICP, index: number): Promise<Contact> {
  if (!process.env.HUNTER_API_KEY) return sampleContact(icp, index, "HUNTER_API_KEY is not set");
  // Searching Hunter by company name alone often matches a different company, so require a domain.
  if (!company.domain) return sampleContact(icp, index, "No company domain found, so Hunter was skipped");
  try {
    let emails = await hunterDomainSearch(company, true);
    // Searches with no results don't use Hunter credits, so widening the filter once is cheap.
    if (emails.length === 0) emails = await hunterDomainSearch(company, false);
    if (emails.length === 0) return sampleContact(icp, index, "Hunter found no contacts for this company");
    const candidates = emails.filter((e) => isDecisionMaker(e, icp));
    if (candidates.length === 0) {
      return sampleContact(icp, index, "Hunter found contacts, but none matching the buyer personas");
    }
    const best = candidates.sort((a, b) => personaScore(b, icp) - personaScore(a, icp))[0];
    return toContact(best, icp);
  } catch (err) {
    console.error(`Hunter lookup failed for ${company.name}:`, err);
    const reason = err instanceof HunterError ? err.message : "Hunter request failed";
    return sampleContact(icp, index, reason);
  }
}

// ---------- Claude draft ----------

const DRAFT_PROMPT = `You write short, personalized B2B cold outreach emails. Return valid JSON only — no markdown, no commentary:
{ "subject": string, "body": string }

Rules:
- Body under 120 words, plain text, line breaks as \\n. Greet the recipient by first name.
- Open by citing the company's trigger signal specifically and naming where you saw it (the source publication or site, e.g. "I saw on TechCrunch that..."). Do not paste the URL.
- Describe the trigger's timing accurately relative to today's date (given below). Never call an event "recent" or "this year" unless it is; if it's over a year old, reference it without implying it just happened.
- If there is no trigger signal, open with the specific reason the company matches instead; never invent news.
- Connect that to one concrete way the sender's product helps someone in the recipient's role.
- End with a low-friction ask (e.g. a 15-minute call) and sign off as "[Your name]".
- Subject: under 8 words, specific to the company, no clickbait.`;

async function draftEmail(company: CompanyMatch, contact: Contact, product: string) {
  let sourceSite = company.sourceUrl;
  try {
    sourceSite = new URL(company.sourceUrl).hostname.replace(/^www\./, "");
  } catch {}

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 600,
    system: DRAFT_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          `Today's date: ${new Date().toISOString().slice(0, 10)}`,
          `Sender's product: ${product || "(not provided)"}`,
          `Recipient: ${contact.name}, ${contact.title} at ${company.name}`,
          `Trigger signal: ${company.triggerSignal ?? "none found"}`,
          `Source: "${company.sourceTitle}" (${sourceSite})`,
          `Why the company matches: ${company.whyMatch}`,
        ].join("\n"),
      },
    ],
  });
  const text = message.content[0].type === "text" ? message.content[0].text : "";
  return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as { subject: string; body: string };
}

// ---------- Route ----------

export async function POST(req: NextRequest) {
  try {
    const { icp, icpId, companies, product } = (await req.json()) as {
      icp?: ICP;
      icpId?: string;
      companies?: CompanyMatch[];
      product?: string;
    };
    if (!icp || !companies?.length) {
      return NextResponse.json({ error: "ICP and companies are required" }, { status: 400 });
    }

    const settled = await Promise.allSettled(
      companies.map(async (company, i): Promise<Lead> => {
        const contact = await findContact(company, icp, i);
        const draft = await draftEmail(company, contact, product ?? "");
        return { id: randomUUID(), company, contact, draft, status: "pending" };
      })
    );

    const leads = settled.flatMap((s) => (s.status === "fulfilled" ? [s.value] : []));
    settled.forEach((s) => s.status === "rejected" && console.error(s.reason));
    if (leads.length === 0) {
      return NextResponse.json({ error: "Failed to draft any emails — check the server log" }, { status: 500 });
    }
    // Save real contacts + leads to the graph (sample contacts are skipped). Never blocks the step.
    let graph: { saved: boolean; count?: number; error?: string } = { saved: false, error: "No ICP id provided" };
    if (icpId) {
      try {
        graph = { saved: true, count: await saveLeads(icpId, leads) };
      } catch (err) {
        console.error("Neo4j save failed:", err);
        graph = { saved: false, error: graphErrorMessage(err) };
      }
    }

    return NextResponse.json({ leads, failed: companies.length - leads.length, graph });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to build outreach drafts" }, { status: 500 });
  }
}
