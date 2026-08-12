import { describe, it, expect } from 'vitest';
import { buildDatasetSummary } from '../datasetSummary';

function makeRecord(overrides: Record<string, any> = {}) {
  return {
    companyName: 'Acme Ltd',
    county: 'Cork',
    official_website_url: 'https://acme.ie',
    decisionMakerName: 'Jane Doe',
    decisionMakerRole: 'Managing Director',
    industry: 'Manufacturing',
    match_type: 'OFFICIAL_WEBSITE',
    ...overrides,
  };
}

describe('buildDatasetSummary', () => {
  it('passes real values through untouched', () => {
    const [row] = buildDatasetSummary([makeRecord()]);
    expect(row).toEqual({
      name: 'Acme Ltd',
      county: 'Cork',
      website: 'https://acme.ie',
      decisionMaker: 'Jane Doe',
      role: 'Managing Director',
      industry: 'Manufacturing',
      matchType: 'OFFICIAL_WEBSITE',
    });
  });

  it('strips literal "null" strings from decisionMaker, role, and industry', () => {
    const [row] = buildDatasetSummary([
      makeRecord({ decisionMakerName: 'null', decisionMakerRole: 'null', industry: 'null' }),
    ]);
    expect(row.decisionMaker).toBeNull();
    expect(row.role).toBeNull();
    expect(row.industry).toBeNull();
  });

  it('strips whitespace-only strings from decisionMaker, role, and industry', () => {
    const [row] = buildDatasetSummary([
      makeRecord({ decisionMakerName: '   ', decisionMakerRole: '\t', industry: '  ' }),
    ]);
    expect(row.decisionMaker).toBeNull();
    expect(row.role).toBeNull();
    expect(row.industry).toBeNull();
  });

  it('leaves real JSON null and matchType/website untouched', () => {
    const [row] = buildDatasetSummary([
      makeRecord({ decisionMakerName: null, official_website_url: null }),
    ]);
    expect(row.decisionMaker).toBeNull();
    expect(row.website).toBeNull();
    expect(row.matchType).toBe('OFFICIAL_WEBSITE');
  });

  it('limits the summary to the first 50 records', () => {
    const records = Array.from({ length: 75 }, (_, i) => makeRecord({ companyName: `Company ${i}` }));
    const summary = buildDatasetSummary(records);
    expect(summary).toHaveLength(50);
    expect(summary[0].name).toBe('Company 0');
    expect(summary[49].name).toBe('Company 49');
  });
});
