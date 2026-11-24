import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { ICP } from "@/types/icp";
import { CompanyMatch } from "@/types/company";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

async function tavilySearch(query: string): Promise<TavilyResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
    },
    body: JSON.stringify({
      query,
      search_depth: "advanced",
      topic: "general",
      time_range: "year",
      max_results: 8,
    }),
  });
  if (!res.ok) {
    throw new Error(`Tavily ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return data.results ?? [];
}

function buildQueries(icp: ICP): string[] {
  const industries = [...icp.targetIndustries].sort((a, b) => b.confidence - a.confidence).slice(0, 3);
  const triggers = [...icp.triggerEvents].sort((a, b) => b.confidence - a.confidence).slice(0, 3);
  const size = `${icp.companySizeRange.min}-${icp.companySizeRange.max} employees`;

  // Pair each top industry with a different trigger event so results cover more ground.
  const queries = industries.map((ind, i) => {
    const trigger = triggers[i % Math.max(triggers.length, 1)]?.event ?? "";
    return `${ind.name} company ${trigger} ${size}`.trim();
  });
  if (industries[0]) queries.push(`fast-growing ${industries[0].name} startups ${size}`);
  return queries;
}

const SYSTEM_PROMPT = `You are a B2B prospecting analyst. You are given an Ideal Customer Profile (ICP) and a numbered list of web search results.
Identify 5–8 distinct, real companies that appear in the search results and match the ICP. Return valid JSON only — no markdown, no commentary.

Shape:
{ "companies": [{ "name": string, "whyMatch": string, "triggerSignal": string | null, "sourceIndex": number }] }

Rules:
- Only use companies explicitly named in the search results. Never invent companies or facts.
- Each company must be a specific operating company (not a list article, VC firm, publisher, or research firm).
- whyMatch: 1–2 sentences tying the company to the ICP (industry, size, buyer fit), citing evidence from the result.
- triggerSignal: a concrete, dated event that happened TO the company itself (funding, hire, launch, expansion, acquisition) that matches or resembles an ICP trigger event, e.g. "Raised $40M Series B in March 2026". A description of what the company sells or does for its clients is NOT a trigger signal. null if none is found — do not guess.
- sourceIndex: the number of the search result the evidence comes from.
- No duplicate companies. Prefer the strongest matches. Return fewer than 5 only if the results genuinely don't contain 5 matches.`;

export async function POST(req: NextRequest) {
  try {
    const { icp } = (await req.json()) as { icp?: ICP };
    if (!icp?.targetIndustries?.length) {
      return NextResponse.json({ error: "An approved ICP is required" }, { status: 400 });
    }
    if (!process.env.TAVILY_API_KEY) {
      return NextResponse.json({ error: "TAVILY_API_KEY is not set" }, { status: 500 });
    }

    const settled = await Promise.allSettled(buildQueries(icp).map(tavilySearch));
    const failures = settled.filter((s) => s.status === "rejected");
    failures.forEach((f) => console.error(f.reason));

    const seen = new Set<string>();
    const results: TavilyResult[] = [];
    for (const s of settled) {
      if (s.status !== "fulfilled") continue;
      for (const r of s.value) {
        if (seen.has(r.url)) continue;
        seen.add(r.url);
        results.push(r);
      }
    }

    if (results.length === 0) {
      const msg = failures.length ? "Tavily search failed — check the server log" : "Search returned no results";
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    const sources = results
      .map((r, i) => `[${i}] ${r.title}\nURL: ${r.url}\n${r.content.slice(0, 1200)}`)
      .join("\n\n");

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `ICP:\n${JSON.stringify(icp, null, 2)}\n\nSearch results:\n${sources}`,
        },
      ],
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "";
    const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    const parsed = JSON.parse(json) as {
      companies: { name: string; whyMatch: string; triggerSignal: string | null; sourceIndex: number }[];
    };

    // Only keep companies whose source actually came back from Tavily.
    const companies: CompanyMatch[] = parsed.companies
      .filter((c) => results[c.sourceIndex])
      .slice(0, 8)
      .map((c) => ({
        name: c.name,
        whyMatch: c.whyMatch,
        triggerSignal: c.triggerSignal || null,
        sourceUrl: results[c.sourceIndex].url,
        sourceTitle: results[c.sourceIndex].title,
      }));

    return NextResponse.json({ companies, searchedSources: results.length });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to find companies" }, { status: 500 });
  }
}
