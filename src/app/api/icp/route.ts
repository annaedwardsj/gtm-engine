import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a go-to-market strategist. Given a product description, return an Ideal Customer Profile as valid JSON only — no markdown, no commentary.

The JSON must match this exact shape:
{
  "targetIndustries": [{ "name": string, "confidence": number }],
  "companySizeRange": { "min": number, "max": number, "unit": "employees", "confidence": number },
  "buyerTitles": [{ "title": string, "seniority": "C-suite" | "VP" | "Director" | "Manager" | "IC", "confidence": number }],
  "triggerEvents": [{ "event": string, "confidence": number }],
  "expansionSegments": [{ "id": string, "name": string, "rationale": string, "confidence": number }]
}

Rules:
- targetIndustries: 3–6 entries
- companySizeRange: realistic employee range, e.g. { min: 50, max: 500 }
- buyerTitles: 3–6 entries
- triggerEvents: 3–5 events that make a company likely to buy (e.g. "Series B funding", "New CTO hire")
- expansionSegments: exactly 2–3 adjacent segments they could expand into after landing the ICP
- confidence: float between 0 and 1
- id fields: short kebab-case slug, e.g. "fintech-smb"`;

export async function POST(req: NextRequest) {
  try {
    const { description } = await req.json();
    if (!description?.trim()) {
      return NextResponse.json({ error: "Description is required" }, { status: 400 });
    }

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Product description: ${description}` }],
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "";
    const icp = JSON.parse(text);
    return NextResponse.json(icp);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to generate ICP" }, { status: 500 });
  }
}
