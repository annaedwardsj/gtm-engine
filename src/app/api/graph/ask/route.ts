import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import neo4j from "neo4j-driver";
import { getDriver, database } from "@/lib/neo4j";
import { graphErrorMessage } from "@/lib/graph";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SCHEMA = `Nodes (label {properties}):
- ICP {id, product, sizeMin, sizeMax, createdAt}
- Industry {key, name}
- Persona {key, name, seniority}          // a buyer title the ICP targets
- TriggerType {key, name}                 // a kind of buying trigger, e.g. "Series B funding"
- Company {key, name, domain, createdAt}
- Signal {key, text, foundAt}             // a real event that happened to a company
- Source {url, title}                     // web page a signal was reported on
- Contact {email, name, title, verification, confidence}   // real people only (from Hunter)
- Lead {id, subject, body, status, createdAt, contactedAt, updatedAt}   // status: 'pending' | 'contacted' | 'rejected'

Relationships:
(:ICP)-[:TARGETS {confidence}]->(:Industry)
(:ICP)-[:SELLS_TO {confidence}]->(:Persona)
(:ICP)-[:WATCHES_FOR {confidence}]->(:TriggerType)
(:ICP)-[:MATCHED {whyMatch, sourceUrl, matchedAt}]->(:Company)
(:Company)-[:HAD]->(:Signal)
(:Signal)-[:REPORTED_BY]->(:Source)
(:Signal)-[:IS_A]->(:TriggerType)
(:Contact)-[:WORKS_AT]->(:Company)
(:Contact)-[:FITS]->(:Persona)
(:Lead)-[:TO]->(:Contact)
(:Lead)-[:FROM]->(:ICP)

All timestamps are ISO-8601 strings (compare them as strings).`;

const CYPHER_PROMPT = `You translate questions about a sales-prospecting graph into Neo4j 5 Cypher.
${SCHEMA}

Return valid JSON only — no markdown: { "cypher": string, "explanation": string }
Rules:
- READ-ONLY: only MATCH / OPTIONAL MATCH / WHERE / WITH / RETURN / ORDER BY / LIMIT / UNWIND / aggregations / EXISTS {}. Never CREATE, MERGE, SET, DELETE, REMOVE, DROP, LOAD CSV, or CALL procedures.
- Return scalar properties with readable column aliases (e.g. c.name AS company), not whole nodes.
- Match names case-insensitively: toLower(c.name) CONTAINS toLower('...').
- A TriggerType can cover several kinds of event (e.g. "Series A or Series B funding"). When the question names a specific detail (e.g. "Series B", "$50M", "CRO"), filter on the Signal's own text for it, not just the TriggerType name.
- Always end with LIMIT 50 or less.
- explanation: one or two plain-English sentences describing the path the query walks, for a beginner learning Cypher.
- If the question can't be answered from this schema, return { "cypher": "", "explanation": "<why not>" }.`;

const FORBIDDEN = /\b(CREATE|MERGE|SET|DELETE|DETACH|REMOVE|DROP|LOAD\s+CSV|CALL|FOREACH|GRANT|DENY|REVOKE|ALTER|RENAME|TERMINATE)\b/i;

function parseJson<T>(text: string): T {
  return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as T;
}

/** Convert driver values (nodes, relationships, temporals) into plain JSON. */
function toPlain(v: unknown): unknown {
  if (v == null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(toPlain);
  if (neo4j.isNode(v as never)) return toPlain((v as { properties: unknown }).properties);
  if (neo4j.isRelationship(v as never)) return (v as { type: string }).type;
  if (neo4j.isPath(v as never)) return "(path)";
  const s = String(v);
  if (s !== "[object Object]") return s; // temporal and other driver types
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toPlain(x)]));
}

async function runReadOnly(cypher: string) {
  if (FORBIDDEN.test(cypher)) throw new Error("Generated query was not read-only, so it was not run");
  const session = getDriver().session({ database: database(), defaultAccessMode: neo4j.session.READ });
  try {
    // executeRead runs in a read transaction: the database itself rejects any write.
    const res = await session.executeRead((tx) => tx.run(cypher), { timeout: 10_000 });
    return {
      columns: res.records[0]?.keys.map(String) ?? [],
      rows: res.records.slice(0, 100).map((r) => toPlain(r.toObject()) as Record<string, unknown>),
    };
  } finally {
    await session.close();
  }
}

async function generateCypher(question: string, previousError?: { cypher: string; error: string }) {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: question }];
  if (previousError) {
    messages.push(
      { role: "assistant", content: JSON.stringify({ cypher: previousError.cypher }) },
      { role: "user", content: `That query failed with: ${previousError.error}\nReturn a corrected query.` }
    );
  }
  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 800,
    system: CYPHER_PROMPT,
    messages,
  });
  const text = msg.content[0].type === "text" ? msg.content[0].text : "";
  return parseJson<{ cypher: string; explanation: string }>(text);
}

async function summarize(question: string, rows: Record<string, unknown>[]) {
  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 300,
    system:
      "Answer the user's question in 1–3 sentences of plain text (no markdown, no bullet lists) using ONLY the query results given. Any count you state must equal the number of matching rows, and only include rows that actually answer the question. State facts only: no advice or recommendations. If the results are empty, say nothing matched yet. Don't mention Cypher or databases.",
    messages: [
      { role: "user", content: `Question: ${question}\n\nResults (JSON):\n${JSON.stringify(rows.slice(0, 50))}` },
    ],
  });
  return msg.content[0].type === "text" ? msg.content[0].text.trim() : "";
}

export async function POST(req: NextRequest) {
  const { question } = (await req.json()) as { question?: string };
  if (!question?.trim()) return NextResponse.json({ error: "Ask a question" }, { status: 400 });

  try {
    let gen = await generateCypher(question);
    if (!gen.cypher) return NextResponse.json({ answer: gen.explanation, cypher: "", explanation: "", columns: [], rows: [] });

    let result;
    try {
      result = await runReadOnly(gen.cypher);
    } catch (err) {
      // One retry: show Claude the database error and let it fix its query.
      gen = await generateCypher(question, { cypher: gen.cypher, error: graphErrorMessage(err) });
      if (!gen.cypher) return NextResponse.json({ answer: gen.explanation, cypher: "", explanation: "", columns: [], rows: [] });
      result = await runReadOnly(gen.cypher);
    }

    const answer = await summarize(question, result.rows);
    return NextResponse.json({ answer, cypher: gen.cypher, explanation: gen.explanation, ...result });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: `Couldn't answer that: ${graphErrorMessage(err)}` }, { status: 502 });
  }
}
