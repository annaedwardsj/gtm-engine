import { CompanyMatch } from "./company";

export interface Contact {
  name: string;
  title: string;
  email: string;
  /** Hunter verification status ("valid", "accept_all", "unknown", ...) or null if not verified. */
  verification: string | null;
  /** Hunter's 0–100 confidence that the email is correct. */
  confidence: number | null;
  source: "hunter" | "sample";
  /** The ICP buyer persona (exact title) this contact best fits, if any. */
  persona: string | null;
  /** Why a sample contact was used instead of Hunter (only set when source is "sample"). */
  sampleReason?: string;
}

export type LeadStatus = "pending" | "contacted" | "rejected";

export interface Lead {
  id: string;
  company: CompanyMatch;
  contact: Contact;
  draft: { subject: string; body: string };
  status: LeadStatus;
  contactedAt?: string;
}
