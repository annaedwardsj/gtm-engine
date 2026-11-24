export interface CompanyMatch {
  name: string;
  domain: string | null;
  whyMatch: string;
  triggerSignal: string | null;
  sourceUrl: string;
  sourceTitle: string;
}
