export interface CompanyMatch {
  name: string;
  domain: string | null;
  whyMatch: string;
  triggerSignal: string | null;
  /** Which ICP trigger event (exact text) the signal is an example of, if any. */
  triggerType: string | null;
  sourceUrl: string;
  sourceTitle: string;
}
