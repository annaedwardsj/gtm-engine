import neo4j, { Driver } from "neo4j-driver";

// One driver for the whole server process. In dev, Next re-runs modules on hot reload,
// so the driver is cached on globalThis to avoid opening a new connection pool each time.
const globalForNeo4j = globalThis as unknown as { neo4jDriver?: Driver };

export function getDriver(): Driver {
  const { NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD } = process.env;
  if (!NEO4J_URI || !NEO4J_USERNAME || !NEO4J_PASSWORD) {
    throw new Error("Neo4j is not configured (NEO4J_URI / NEO4J_USERNAME / NEO4J_PASSWORD)");
  }
  if (!globalForNeo4j.neo4jDriver) {
    globalForNeo4j.neo4jDriver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USERNAME, NEO4J_PASSWORD), {
      // Return whole numbers as plain JS numbers instead of Neo4j's 64-bit Integer objects.
      disableLosslessIntegers: true,
    });
  }
  return globalForNeo4j.neo4jDriver;
}

export const database = () => process.env.NEO4J_DATABASE || undefined;

/** Run a read-only Cypher query and return plain objects. */
export async function readQuery(cypher: string, params: Record<string, unknown> = {}) {
  const { records, keys } = await getDriver().executeQuery(cypher, params, {
    database: database(),
    routing: neo4j.routing.READ,
  });
  return { columns: keys as string[], rows: records.map((r) => r.toObject()) };
}
