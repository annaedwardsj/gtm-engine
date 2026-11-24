# AI GTM Engine

Describe your product in a sentence or two. The app works out who to sell to, finds real companies that fit, finds a decision-maker at each one, drafts a personalized outreach email for each, and keeps everything in a graph you can ask questions of.

Built with Next.js, Claude (Anthropic), Tavily, Hunter and Neo4j.

## The 4 steps

1. **Ideal Customer Profile.** Claude turns your product description into an ICP: target industries, company size, buyer personas, buying triggers (e.g. "Series B funding") and expansion segments, each with a confidence score. You review it and approve it.
2. **Find matching companies.** Tavily searches the web using the approved ICP. Claude then picks 5–8 real companies from the results. Each one gets a card showing why it matches, any trigger event found, and a clickable link to the source page.
3. **Contacts and outreach.** Hunter finds one decision-maker per company who matches a buyer persona, with their email's verification status. Claude drafts a short email that cites the company's trigger event and source. The drafts go into a review queue with **Approve**, **Edit** and **Reject**. Approve **never sends email**: it marks the lead "Contacted" and logs a timestamp. If Hunter fails, runs out of credits or finds no one suitable, the app uses a clearly labeled sample contact instead.
4. **Graph.** Every step is saved to Neo4j as a graph of ICPs, industries, personas, trigger types, companies, signals, sources, contacts and leads. A company found by several ICPs is stored once. The Graph panel shows counts, one-click questions (each displays its Cypher query), and an "ask your graph" box where Claude writes a read-only Cypher query for any question. Sample contacts are never stored.

## Run it locally

You need Node.js 20 or newer, plus accounts for the services below. All of them have free tiers.

```bash
git clone https://github.com/annaedwardsj/gtm-engine.git
cd gtm-engine
npm install
```

Create a `.env.local` file in the project root with these variables:

| Variable | What it's for |
|---|---|
| `ANTHROPIC_API_KEY` | Claude: generating the ICP, picking companies, drafting emails, answering graph questions |
| `TAVILY_API_KEY` | Web search for matching companies (step 2) |
| `HUNTER_API_KEY` | Finding decision-makers' emails (step 3). Optional: without it, every lead gets a sample contact |
| `NEO4J_URI` | Your Neo4j connection URI, e.g. from a free [AuraDB](https://neo4j.com/cloud/aura/) instance |
| `NEO4J_USERNAME` | Neo4j username |
| `NEO4J_PASSWORD` | Neo4j password |
| `NEO4J_DATABASE` | Neo4j database name (optional; the server's default database is used if it's not set) |

Then start the dev server and open http://localhost:3000:

```bash
npm run dev
```

`npm run dev` runs `next dev --webpack`, because Turbopack crashed on Windows during development.

**Notes:**
- Hunter's free plan includes 50 searches a month, and step 3 uses about one per company.
- A free AuraDB instance pauses after a few days without use; resume it from the Aura console.
- If Neo4j can't be reached, steps 1–3 still work and the page shows a "Graph not saved" warning.
- Approved emails are logged to `.data/outreach-log.jsonl`, which is gitignored.

## Known bugs

This is a hackathon build. Known issues found in testing, such as a too-loose persona filter and some mislabeled trigger types, are listed in [TODO.md](TODO.md).
