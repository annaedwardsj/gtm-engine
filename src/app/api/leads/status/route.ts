import { NextRequest, NextResponse } from "next/server";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { updateLead, graphErrorMessage } from "@/lib/graph";

const LOG_DIR = path.join(process.cwd(), ".data");
const LOG_FILE = path.join(LOG_DIR, "outreach-log.jsonl");

/**
 * Records a lead status change. This never sends email — approving a draft
 * only marks the lead "contacted", appends a timestamped entry to the log,
 * and updates the Lead node in Neo4j (sample-contact leads aren't in the graph).
 */
export async function POST(req: NextRequest) {
  try {
    const { leadId, company, contactEmail, contactSource, status, subject, body } = await req.json();
    if (!leadId || !["contacted", "rejected", "pending"].includes(status)) {
      return NextResponse.json({ error: "leadId and a valid status are required" }, { status: 400 });
    }
    const entry = {
      timestamp: new Date().toISOString(),
      leadId,
      company,
      contactEmail,
      contactSource,
      status,
      ...(status === "contacted" ? { subject, body } : {}),
    };
    await mkdir(LOG_DIR, { recursive: true });
    await appendFile(LOG_FILE, JSON.stringify(entry) + "\n", "utf8");

    let graph: { saved: boolean; error?: string } = { saved: false, error: "Sample contact — not stored in graph" };
    if (contactSource === "hunter") {
      try {
        await updateLead(leadId, {
          status,
          contactedAt: status === "contacted" ? entry.timestamp : null,
          ...(status === "contacted" ? { subject, body } : {}),
        });
        graph = { saved: true };
      } catch (err) {
        console.error("Neo4j update failed:", err);
        graph = { saved: false, error: graphErrorMessage(err) };
      }
    }

    return NextResponse.json({ ok: true, timestamp: entry.timestamp, graph });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to log status" }, { status: 500 });
  }
}
