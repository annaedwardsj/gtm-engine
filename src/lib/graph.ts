/**
 * Writes the GTM pipeline into Neo4j.
 *
 * Every write uses MERGE ("find this node/relationship, or create it if missing"),
 * so saving the same thing twice never creates duplicates. Nodes are matched on a
 * stable key — e.g. a Company on its domain — so a company found by several ICPs
 * becomes ONE node with several MATCHED relationships.
 *
 * Sample contacts (source "sample") are never written: they aren't real people.
 */
import { ManagedTransaction } from "neo4j-driver";
import { getDriver, database } from "./neo4j";
import { ICP } from "@/types/icp";
import { CompanyMatch } from "@/types/company";
import { Lead } from "@/types/lead";

export const companyKey = (c: Pick<CompanyMatch, "name" | "domain">) =>
  c.domain ? c.domain.toLowerCase() : `name:${c.name.trim().toLowerCase()}`;

const key = (s: string) => s.trim().toLowerCase();

// Unique constraints make MERGE fast and guarantee no duplicate keys. Created once per process.
const CONSTRAINTS: [string, string][] = [
  ["ICP", "id"],
  ["Industry", "key"],
  ["Persona", "key"],
  ["TriggerType", "key"],
  ["Company", "key"],
  ["Signal", "key"],
  ["Source", "url"],
  ["Contact", "email"],
  ["Lead", "id"],
];
let schemaReady: Promise<void> | null = null;

function ensureSchema() {
  schemaReady ??= (async () => {
    const driver = getDriver();
    for (const [label, prop] of CONSTRAINTS) {
      await driver.executeQuery(
        `CREATE CONSTRAINT ${label.toLowerCase()}_${prop} IF NOT EXISTS FOR (n:${label}) REQUIRE n.${prop} IS UNIQUE`,
        {},
        { database: database() }
      );
    }
  })().catch((err) => {
    schemaReady = null; // retry next time
    throw err;
  });
  return schemaReady;
}

async function write(work: (tx: ManagedTransaction) => Promise<void>) {
  await ensureSchema();
  const session = getDriver().session({ database: database() });
  try {
    await session.executeWrite(work);
  } finally {
    await session.close();
  }
}

/** ICP node plus the industries, personas and trigger types it targets. */
export async function saveIcp(icpId: string, icp: ICP, product: string) {
  await write(async (tx) => {
    await tx.run(
      `MERGE (i:ICP {id: $id})
       ON CREATE SET i.createdAt = $now
       SET i.product = $product, i.sizeMin = $min, i.sizeMax = $max`,
      { id: icpId, now: new Date().toISOString(), product, min: icp.companySizeRange.min, max: icp.companySizeRange.max }
    );
    await tx.run(
      `MATCH (i:ICP {id: $id})
       UNWIND $items AS it
       MERGE (n:Industry {key: it.key}) ON CREATE SET n.name = it.name
       MERGE (i)-[r:TARGETS]->(n) SET r.confidence = it.confidence`,
      { id: icpId, items: icp.targetIndustries.map((x) => ({ key: key(x.name), name: x.name, confidence: x.confidence })) }
    );
    await tx.run(
      `MATCH (i:ICP {id: $id})
       UNWIND $items AS it
       MERGE (p:Persona {key: it.key}) ON CREATE SET p.name = it.name
       SET p.seniority = it.seniority
       MERGE (i)-[r:SELLS_TO]->(p) SET r.confidence = it.confidence`,
      {
        id: icpId,
        items: icp.buyerTitles.map((x) => ({ key: key(x.title), name: x.title, seniority: x.seniority, confidence: x.confidence })),
      }
    );
    await tx.run(
      `MATCH (i:ICP {id: $id})
       UNWIND $items AS it
       MERGE (t:TriggerType {key: it.key}) ON CREATE SET t.name = it.name
       MERGE (i)-[r:WATCHES_FOR]->(t) SET r.confidence = it.confidence`,
      { id: icpId, items: icp.triggerEvents.map((x) => ({ key: key(x.event), name: x.event, confidence: x.confidence })) }
    );
  });
}

/** Companies matched by an ICP, with their trigger signals and where each was reported. */
export async function saveCompanies(icpId: string, companies: CompanyMatch[]) {
  const now = new Date().toISOString();
  const items = companies.map((c) => ({
    key: companyKey(c),
    name: c.name,
    domain: c.domain,
    whyMatch: c.whyMatch,
    sourceUrl: c.sourceUrl,
    sourceTitle: c.sourceTitle,
    signal: c.triggerSignal,
    signalKey: c.triggerSignal ? `${companyKey(c)}|${key(c.triggerSignal)}` : null,
    triggerType: c.triggerType ? key(c.triggerType) : null,
  }));

  await write(async (tx) => {
    await tx.run(
      `MATCH (i:ICP {id: $icpId})
       UNWIND $items AS c
       MERGE (co:Company {key: c.key})
       ON CREATE SET co.createdAt = $now
       SET co.name = c.name, co.domain = coalesce(c.domain, co.domain)
       MERGE (i)-[m:MATCHED]->(co)
       SET m.whyMatch = c.whyMatch, m.sourceUrl = c.sourceUrl, m.matchedAt = $now`,
      { icpId, items, now }
    );
    const withSignal = items.filter((c) => c.signalKey);
    await tx.run(
      `UNWIND $items AS c
       MATCH (co:Company {key: c.key})
       MERGE (s:Signal {key: c.signalKey}) ON CREATE SET s.text = c.signal, s.foundAt = $now
       MERGE (co)-[:HAD]->(s)
       MERGE (src:Source {url: c.sourceUrl}) SET src.title = c.sourceTitle
       MERGE (s)-[:REPORTED_BY]->(src)`,
      { items: withSignal, now }
    );
    await tx.run(
      `UNWIND $items AS c
       MATCH (s:Signal {key: c.signalKey})
       MATCH (t:TriggerType {key: c.triggerType})
       MERGE (s)-[:IS_A]->(t)`,
      { items: withSignal.filter((c) => c.triggerType) }
    );
  });
}

/** Real (Hunter) contacts and their outreach leads. Sample contacts are skipped. Returns how many were saved. */
export async function saveLeads(icpId: string, leads: Lead[]) {
  const real = leads.filter((l) => l.contact.source === "hunter");
  if (real.length === 0) return 0;
  const now = new Date().toISOString();
  const items = real.map((l) => ({
    id: l.id,
    companyKey: companyKey(l.company),
    companyName: l.company.name,
    email: l.contact.email.toLowerCase(),
    name: l.contact.name,
    title: l.contact.title,
    verification: l.contact.verification,
    confidence: l.contact.confidence,
    persona: l.contact.persona ? key(l.contact.persona) : null,
    subject: l.draft.subject,
    body: l.draft.body,
  }));

  await write(async (tx) => {
    await tx.run(
      `MATCH (i:ICP {id: $icpId})
       UNWIND $items AS l
       MERGE (co:Company {key: l.companyKey}) ON CREATE SET co.name = l.companyName, co.createdAt = $now
       MERGE (ct:Contact {email: l.email})
       SET ct.name = l.name, ct.title = l.title, ct.verification = l.verification, ct.confidence = l.confidence
       MERGE (ct)-[:WORKS_AT]->(co)
       MERGE (ld:Lead {id: l.id})
       ON CREATE SET ld.createdAt = $now, ld.status = 'pending'
       SET ld.subject = l.subject, ld.body = l.body
       MERGE (ld)-[:TO]->(ct)
       MERGE (ld)-[:FROM]->(i)`,
      { icpId, items, now }
    );
    await tx.run(
      `UNWIND $items AS l
       MATCH (ct:Contact {email: l.email})
       MATCH (p:Persona {key: l.persona})
       MERGE (ct)-[:FITS]->(p)`,
      { items: items.filter((l) => l.persona) }
    );
  });
  return real.length;
}

/** Update a lead's status and/or draft. A no-op for sample-contact leads, which were never saved. */
export async function updateLead(
  id: string,
  patch: { status?: string; contactedAt?: string | null; subject?: string; body?: string }
) {
  await write(async (tx) => {
    await tx.run(
      `MATCH (ld:Lead {id: $id})
       SET ld.status = coalesce($status, ld.status),
           ld.subject = coalesce($subject, ld.subject),
           ld.body = coalesce($body, ld.body),
           ld.updatedAt = $now
       FOREACH (_ IN CASE WHEN $status IS NULL THEN [] ELSE [1] END |
         SET ld.contactedAt = $contactedAt)`,
      {
        id,
        status: patch.status ?? null,
        contactedAt: patch.contactedAt ?? null,
        subject: patch.subject ?? null,
        body: patch.body ?? null,
        now: new Date().toISOString(),
      }
    );
  });
}

export const graphErrorMessage = (err: unknown) =>
  err instanceof Error ? err.message.split("\n")[0] : "Unknown Neo4j error";
