import { NextRequest, NextResponse } from "next/server";
import { readQuery } from "@/lib/neo4j";
import { SAVED_QUERIES } from "@/lib/savedQueries";
import { graphErrorMessage } from "@/lib/graph";

const STATS_CYPHER = `CALL () { MATCH (n:ICP) RETURN count(n) AS icps }
CALL () { MATCH (n:Company) RETURN count(n) AS companies }
CALL () { MATCH (n:Signal) RETURN count(n) AS signals }
CALL () { MATCH (n:Contact) RETURN count(n) AS contacts }
CALL () { MATCH (n:Lead) RETURN count(n) AS leads }
CALL () { MATCH (l:Lead {status: 'pending'}) RETURN count(l) AS pending }
CALL () { MATCH (l:Lead {status: 'contacted'}) RETURN count(l) AS contacted }
CALL () { MATCH (l:Lead {status: 'rejected'}) RETURN count(l) AS rejected }
CALL () { MATCH ()-[r]->() RETURN count(r) AS relationships }
RETURN icps, companies, signals, contacts, leads, pending, contacted, rejected, relationships`;

/** GET /api/graph → node counts.  GET /api/graph?q=<saved query id> → that query's results. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  try {
    if (!q) {
      const { rows } = await readQuery(STATS_CYPHER);
      return NextResponse.json({ stats: rows[0] });
    }
    const saved = SAVED_QUERIES.find((s) => s.id === q);
    if (!saved) return NextResponse.json({ error: "Unknown query" }, { status: 404 });
    return NextResponse.json(await readQuery(saved.cypher));
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: `Neo4j: ${graphErrorMessage(err)}` }, { status: 502 });
  }
}
