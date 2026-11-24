export interface ICP {
  targetIndustries: { name: string; confidence: number }[];
  companySizeRange: { min: number; max: number; unit: string; confidence: number };
  buyerTitles: { title: string; seniority: string; confidence: number }[];
  triggerEvents: { event: string; confidence: number }[];
  expansionSegments: { id: string; name: string; rationale: string; confidence: number }[];
}

export type SegmentState = "pending" | "accepted" | "dismissed";
