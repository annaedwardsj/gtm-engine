/**
 * One-click graph questions. Each is plain Cypher, shown in the app so you can learn from it.
 *
 * Reading Cypher: (a:Label) is a node, -[:TYPE]-> is a relationship, and MATCH describes
 * a pattern to find, like drawing the path on a whiteboard.
 */
export interface SavedQuery {
  id: string;
  question: string;
  explain: string;
  cypher: string;
}

export const SAVED_QUERIES: SavedQuery[] = [
  {
    id: "multi-icp",
    question: "Which companies matched more than one ICP?",
    explain: "Follows MATCHED arrows backwards from each company and counts how many different ICPs point at it.",
    cypher: `MATCH (i:ICP)-[:MATCHED]->(c:Company)
WITH c, count(DISTINCT i) AS icps
WHERE icps > 1
RETURN c.name AS company, c.domain AS domain, icps
ORDER BY icps DESC`,
  },
  {
    id: "trigger-types",
    question: "Which trigger types actually show up most in real signals?",
    explain: "Counts the real-world Signals linked (IS_A) to each trigger type your ICPs watch for.",
    cypher: `MATCH (s:Signal)-[:IS_A]->(t:TriggerType)
RETURN t.name AS triggerType, count(s) AS signals
ORDER BY signals DESC`,
  },
  {
    id: "contacted",
    question: "Who have I contacted, when, and where?",
    explain: "Walks Lead → Contact → Company for every lead you approved.",
    cypher: `MATCH (l:Lead {status: 'contacted'})-[:TO]->(ct:Contact)-[:WORKS_AT]->(c:Company)
RETURN ct.name AS contact, ct.title AS title, c.name AS company, l.contactedAt AS contactedAt
ORDER BY contactedAt DESC`,
  },
  {
    id: "signal-no-contact",
    question: "Which companies have a trigger signal but no contact yet?",
    explain: "Finds companies with a HAD → Signal path where no Contact WORKS_AT them.",
    cypher: `MATCH (c:Company)-[:HAD]->(s:Signal)
WHERE NOT EXISTS { (c)<-[:WORKS_AT]-(:Contact) }
RETURN c.name AS company, s.text AS signal`,
  },
  {
    id: "personas",
    question: "Which personas am I really reaching vs. targeting?",
    explain: "For each persona an ICP SELLS_TO, counts the real contacts that FIT it and how many were contacted.",
    cypher: `MATCH (:ICP)-[:SELLS_TO]->(p:Persona)
OPTIONAL MATCH (p)<-[:FITS]-(ct:Contact)
OPTIONAL MATCH (ct)<-[:TO]-(l:Lead {status: 'contacted'})
RETURN p.name AS persona, count(DISTINCT ct) AS contacts, count(DISTINCT l) AS contacted
ORDER BY contacts DESC, persona`,
  },
];
