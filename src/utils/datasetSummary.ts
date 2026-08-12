import { cleanNullableField } from './normalize';

export interface DatasetSummaryRow {
  name: string;
  county: string;
  website: string | null;
  decisionMaker: string | null;
  role: string | null;
  industry: string | null;
  matchType: string;
}

/**
 * Builds the compact per-record summary fed into the /api/ai-analyze-dataset
 * prompt. Nullable AI-sourced fields are cleaned so legacy records holding
 * the literal string "null" (pre-dating the enrichment-side fix) don't leak
 * that text into the lead-scoring prompt.
 */
export function buildDatasetSummary(records: any[], limit = 50): DatasetSummaryRow[] {
  return records.slice(0, limit).map((r: any) => ({
    name: r.companyName,
    county: r.county,
    website: r.official_website_url,
    decisionMaker: cleanNullableField(r.decisionMakerName),
    role: cleanNullableField(r.decisionMakerRole),
    industry: cleanNullableField(r.industry),
    matchType: r.match_type,
  }));
}
