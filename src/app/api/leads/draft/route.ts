import { NextRequest, NextResponse } from "next/server";
import { updateLead, graphErrorMessage } from "@/lib/graph";

/** Saves an edited draft to the Lead node in Neo4j. */
export async function POST(req: NextRequest) {
  const { leadId, subject, body } = await req.json();
  if (!leadId || !subject?.trim() || !body?.trim()) {
    return NextResponse.json({ error: "leadId, subject and body are required" }, { status: 400 });
  }
  try {
    await updateLead(leadId, { subject, body });
    return NextResponse.json({ graph: { saved: true } });
  } catch (err) {
    console.error("Neo4j update failed:", err);
    return NextResponse.json({ graph: { saved: false, error: graphErrorMessage(err) } });
  }
}
