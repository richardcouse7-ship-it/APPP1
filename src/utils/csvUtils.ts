import Papa from 'papaparse';
import { CompanyRecord } from '../types';
import { getDedupKey, cleanNullableField } from './normalize';

const IRISH_COUNTIES = new Set([
  'antrim', 'armagh', 'carlow', 'cavan', 'clare', 'cork', 'derry', 'donegal',
  'down', 'dublin', 'fermanagh', 'galway', 'kerry', 'kildare', 'kilkenny',
  'laois', 'leitrim', 'limerick', 'longford', 'louth', 'mayo', 'meath',
  'monaghan', 'offaly', 'roscommon', 'sligo', 'tipperary', 'tyrone',
  'waterford', 'westmeath', 'wexford', 'wicklow', 'ireland', 'republic of ireland'
]);

// Helper: Does a value look like a numeric CRO/KMT registration number?
export function isNumericCroNumber(val: string): boolean {
  if (!val) return false;
  const clean = val.trim();
  if (clean.length === 0) return false;
  if (EIRCODE_PATTERN.test(clean)) return false; // Eircodes are NOT CRO numbers
  if (/^\d{3,10}$/.test(clean)) return true;
  if (/^(cro|reg|inc|no|id|kmt|num)[-:\s]*\d+/i.test(clean)) return true;
  const digitCount = (clean.match(/\d/g) || []).length;
  if (clean.length <= 12 && digitCount >= 3 && digitCount / clean.length >= 0.6) return true;
  return false;
}

// Helper: Does a value look like a business/company name?
export function isCompanyName(val: string): boolean {
  if (!val) return false;
  const clean = val.trim();
  if (clean.length < 2) return false;
  if (/^\d+$/.test(clean)) return false;
  if (EIRCODE_PATTERN.test(clean)) return false; // Eircodes are NOT company names
  const lower = clean.toLowerCase();
  const corporateKeywords = [
    'ltd', 'limited', 'plc', 'dac', 'group', 'holdings', 'co', 'co.', 'co-op',
    'co-operative', 'creamery', 'services', 'store', 'motors', 'hotel', 'pub',
    'restaurant', 'cafe', 'café', 'engineering', 'logistics', 'bakery', 'brewery',
    'pharma', 'tech', 'technologies', 'solutions', 'consulting', 'construction',
    'farm', 'meats', 'foods', 'supermarket', 'dairies', 'transport', 'ireland', 'center', 'centre'
  ];
  if (corporateKeywords.some((kw) => lower.includes(kw))) return true;
  if (/[a-zA-Z]{3,}/.test(clean) && !isNumericCroNumber(clean) && !IRISH_COUNTIES.has(lower)) return true;
  return false;
}

// Helper: Extract county from text fields
export function extractIrishCountyFromText(...fields: (string | undefined | null)[]): string {
  for (const field of fields) {
    if (!field) continue;
    const str = field.toString();
    const clean = str.replace(/[^\w\s]/g, ' ').toLowerCase();
    const words = clean.split(/\s+/);
    for (const w of words) {
      if (IRISH_COUNTIES.has(w) && w !== 'ireland' && w !== 'republic of ireland') {
        return w.charAt(0).toUpperCase() + w.slice(1);
      }
    }
  }
  return 'Ireland';
}

// Helper: Is a value an Irish county?
export function isCountyName(val: string): boolean {
  if (!val) return false;
  const clean = val.trim().toLowerCase().replace(/[^\w\s]/g, '');
  return IRISH_COUNTIES.has(clean);
}

const EIRCODE_PATTERN = /^[A-Za-z]\d[A-Za-z0-9]\s?[A-Za-z0-9]{4}$/;

export function extractEircodeFromRow(row: any): string | null {
  if (!row) return null;
  const candidateKeys = Object.keys(row).filter((k) =>
    /eircode|eir_code|eir\s*code|postcode|postal_code|postal\s*code|zip/i.test(k)
  );
  for (const key of candidateKeys) {
    const val = (row[key] || '').toString().trim();
    if (val && EIRCODE_PATTERN.test(val)) {
      return val.toUpperCase();
    }
  }
  return null;
}

export interface SmartExtractResult {
  records: CompanyRecord[];
  autoCorrections: string[];
  columnMapping: {
    companyNumberKey: string;
    companyNameKey: string;
    countyKey: string;
  };
}

export function smartExtractAndHealRecords(
  rows: any[],
  headers: string[]
): SmartExtractResult {
  const autoCorrections: string[] = [];
  const records: CompanyRecord[] = [];

  if (!rows || rows.length === 0) {
    return { records: [], autoCorrections: [], columnMapping: { companyNumberKey: '', companyNameKey: '', countyKey: '' } };
  }

  // 1. Initial Keyword Header Identification
  let companyNumberKey = headers.find((h) =>
    /^(company_num|cro_number|company_number|company\s*number|cro|kmt|reg\s*no|registration)$/i.test(h)
  ) || headers.find((h) =>
    /company_num|cro_number|company\s*number|cro|kmt|reg\s*no|registration/i.test(h) && !/eircode|eir_code|postcode|postal/i.test(h)
  ) || '';

  let companyNameKey = headers.find((h) =>
    /^(company_name|business_name|company\s*name|business\s*name)$/i.test(h)
  ) || headers.find((h) =>
    /company\s*name|business\s*name|firm|organization|entity|trader|name|title/i.test(h)
  ) || headers.find((h) => !/address|county|eircode|postcode|phone|email|website/i.test(h)) || headers[0];

  let countyKey = headers.find((h) =>
    /^(county|company_address_4|company_address_3|company_address_2|address\s*4|address4)$/i.test(h)
  ) || headers.find((h) =>
    /address\s*4|county|address4|company_address|location|region|city|town|area|district/i.test(h)
  ) || headers.find((h) => h !== companyNumberKey && h !== companyNameKey) || headers[0];

  const decisionMakerNameKey = headers.find((h) =>
    /decision\s*maker|ceo|executive|director|contact\s*name|owner|manager|key\s*person/i.test(h)
  );

  const decisionMakerRoleKey = headers.find((h) =>
    /role|title|position|job\s*title/i.test(h)
  );

  // 2. Content Sampling (Check sample rows to detect swapped or misaligned columns)
  const sampleRows = rows.slice(0, 25);
  let numberColNameCount = 0;
  let numberColDigitCount = 0;
  let nameColDigitCount = 0;
  let nameColNameCount = 0;

  sampleRows.forEach((row) => {
    const valInNumberKey = companyNumberKey ? (row[companyNumberKey] || '').toString().trim() : '';
    const valInNameKey = companyNameKey ? (row[companyNameKey] || '').toString().trim() : '';

    if (valInNumberKey && isCompanyName(valInNumberKey)) numberColNameCount++;
    if (valInNumberKey && isNumericCroNumber(valInNumberKey)) numberColDigitCount++;

    if (valInNameKey && isNumericCroNumber(valInNameKey)) nameColDigitCount++;
    if (valInNameKey && isCompanyName(valInNameKey)) nameColNameCount++;
  });

  // 3. Auto-Heal Header Swaps (e.g. "Company Number" contains names, "Company Name" contains numbers)
  if (
    companyNumberKey &&
    companyNameKey &&
    companyNumberKey !== companyNameKey &&
    (numberColNameCount > numberColDigitCount || nameColDigitCount > nameColNameCount)
  ) {
    const temp = companyNumberKey;
    companyNumberKey = companyNameKey;
    companyNameKey = temp;
    autoCorrections.push(
      `✨ Smart Column Auto-Healing: Auto-detected swapped headers! Column '${companyNumberKey}' was identified as Company Name and '${companyNameKey}' as CRO Number/KMT.`
    );
  }

  // 4. Extract & Row-Level Auto-Correction
  let rowLevelSwapsCount = 0;

  rows.forEach((row: any, index: number) => {
    let companyName = companyNameKey ? (row[companyNameKey] || '').toString().trim() : '';
    let companyNumber = companyNumberKey ? (row[companyNumberKey] || '').toString().trim() : '';
    let countyRaw = (row[countyKey] || '').toString().trim();
    let county = extractIrishCountyFromText(
      countyRaw,
      row['company_address_4'],
      row['company_address_3'],
      row['company_address_2'],
      row['company_address_1'],
      row['Address4'],
      row['Address 4'],
      row['County']
    );

    const dmName = decisionMakerNameKey ? (row[decisionMakerNameKey] || '').toString().trim() : undefined;
    const dmRole = decisionMakerRoleKey ? (row[decisionMakerRoleKey] || '').toString().trim() : undefined;

    // Row-level check: Is companyName actually a numeric CRO and companyNumber actually a company name?
    if (isNumericCroNumber(companyName) && isCompanyName(companyNumber)) {
      const temp = companyName;
      companyName = companyNumber;
      companyNumber = temp;
      rowLevelSwapsCount++;
    }

    // Row-level check: Is county actually a company name and companyName a county?
    if (isCountyName(companyName) && isCompanyName(county)) {
      const temp = companyName;
      companyName = county;
      county = temp;
      rowLevelSwapsCount++;
    }

    if (!county || !isCountyName(county)) {
      if (!county) county = 'Ireland';
    }

    if (companyName) {
      records.push({
        id: `record-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 7)}`,
        companyNumber: companyNumber || getDedupKey(undefined, companyName, county),
        companyName,
        county,
        eircode: extractEircodeFromRow(row),
        status: 'PENDING',
        official_website_url: null,
        decisionMakerName: dmName || null,
        decisionMakerRole: dmRole || null,
        confidence_score: 'NONE',
        match_type: 'UNPROCESSED',
        rawRowData: row,
        originalHeaders: Object.keys(row),
      });
    }
  });

  if (rowLevelSwapsCount > 0) {
    autoCorrections.push(
      `✨ Smart Row Healing: Automatically corrected ${rowLevelSwapsCount} misaligned cells where Name and CRO Number/County were inverted.`
    );
  }

  return {
    records,
    autoCorrections,
    columnMapping: {
      companyNumberKey,
      companyNameKey,
      countyKey,
    },
  };
}

export interface ColumnAnalysis {
  header: string;
  index: number;
  sampleValues: string[];
  bestMatchRole: 'companyName' | 'companyNumber' | 'county' | 'decisionMakerName' | 'decisionMakerRole' | 'phoneNumber' | 'contactEmail' | 'website' | 'unknown';
  confidenceScore: number; // 0 to 100
  roleScores: {
    companyName: number;
    companyNumber: number;
    county: number;
    decisionMakerName: number;
    decisionMakerRole: number;
    phoneNumber: number;
    contactEmail: number;
  };
}

export function analyzeColumnsContent(rows: any[], headers: string[]): ColumnAnalysis[] {
  const samples = rows.slice(0, 30);
  const sampleCount = samples.length || 1;

  return headers.map((header, index) => {
    const values = samples.map((r) => (r[header] || '').toString().trim()).filter(Boolean);
    const sampleValues = values.slice(0, 4);

    let companyNameCount = 0;
    let companyNumberCount = 0;
    let countyCount = 0;
    let dmNameCount = 0;
    let dmRoleCount = 0;
    let phoneCount = 0;
    let emailCount = 0;

    values.forEach((val) => {
      if (isCompanyName(val)) companyNameCount++;
      if (isNumericCroNumber(val)) companyNumberCount++;
      if (isCountyName(val)) countyCount++;

      // Check decision maker human name (e.g. "John Smith", "Mary O'Donnell")
      if (/^[A-Z][a-z\u00C0-\u024F']+(\s+[A-Z][a-z\u00C0-\u024F']+){1,2}$/.test(val) && !isCompanyName(val) && !isCountyName(val)) {
        dmNameCount++;
      }

      // Check job titles
      if (/ceo|managing director|director|founder|head of|manager|owner|president|partner|vp|officer|executive/i.test(val)) {
        dmRoleCount++;
      }

      // Check phone numbers
      if (/^(\+?353|0)[0-9\s\-()]{7,}$/.test(val)) {
        phoneCount++;
      }

      // Check emails
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
        emailCount++;
      }
    });

    // Score calculations (0 to 100)
    const companyNameScore = Math.min(100, Math.round((companyNameCount / sampleCount) * 100));
    const companyNumberScore = Math.min(100, Math.round((companyNumberCount / sampleCount) * 100));
    const countyScore = Math.min(100, Math.round((countyCount / sampleCount) * 100));
    const dmNameScore = Math.min(100, Math.round((dmNameCount / sampleCount) * 100));
    const dmRoleScore = Math.min(100, Math.round((dmRoleCount / sampleCount) * 100));
    const phoneScore = Math.min(100, Math.round((phoneCount / sampleCount) * 100));
    const emailScore = Math.min(100, Math.round((emailCount / sampleCount) * 100));

    // Also boost header keyword matches
    const hLower = header.toLowerCase();
    let nameH = /name|company|business|firm|trader|entity/i.test(hLower) && !/address|county|eircode|postcode/i.test(hLower) ? 25 : 0;
    let numH = (/cro|reg|kmt|number|id/i.test(hLower) || (/\bcode\b/i.test(hLower) && !/eircode|eir_code|postcode|postal/i.test(hLower))) ? 25 : 0;
    let countyH = /county|address|location|city|town/i.test(hLower) ? 25 : 0;
    let dmNameH = /decision\s*maker|ceo|contact|executive|director|person/i.test(hLower) ? 25 : 0;
    let dmRoleH = /role|title|position/i.test(hLower) ? 25 : 0;

    const finalScores = {
      companyName: Math.min(100, companyNameScore + nameH),
      companyNumber: Math.min(100, companyNumberScore + numH),
      county: Math.min(100, countyScore + countyH),
      decisionMakerName: Math.min(100, dmNameScore + dmNameH),
      decisionMakerRole: Math.min(100, dmRoleScore + dmRoleH),
      phoneNumber: Math.min(100, phoneScore),
      contactEmail: Math.min(100, emailScore),
    };

    // Find best match role
    let bestRole: ColumnAnalysis['bestMatchRole'] = 'unknown';
    let maxScore = 0;

    (Object.keys(finalScores) as (keyof typeof finalScores)[]).forEach((role) => {
      if (finalScores[role] > maxScore && finalScores[role] >= 20) {
        maxScore = finalScores[role];
        bestRole = role as any;
      }
    });

    return {
      header,
      index,
      sampleValues,
      bestMatchRole: bestRole,
      confidenceScore: maxScore,
      roleScores: finalScores,
    };
  });
}

export interface CustomColumnMapping {
  companyNameKey: string;
  companyNumberKey: string;
  countyKey: string;
  decisionMakerNameKey?: string;
  decisionMakerRoleKey?: string;
}

export function parseCSVRaw(file: File): Promise<{ headers: string[]; rows: any[]; errors: string[] }> {
  return new Promise((resolve) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (!results.data || results.data.length === 0) {
          resolve({ headers: [], rows: [], errors: ['CSV file is empty or could not be parsed.'] });
          return;
        }
        const headers = results.meta.fields || [];
        resolve({ headers, rows: results.data, errors: [] });
      },
      error: (error) => {
        resolve({ headers: [], rows: [], errors: [error.message || 'Error parsing CSV file.'] });
      },
    });
  });
}

export function extractRecordsWithCustomMapping(
  rows: any[],
  mapping: CustomColumnMapping,
  applyRowHealing: boolean = true
): { records: CompanyRecord[]; autoCorrections: string[] } {
  const autoCorrections: string[] = [];
  const records: CompanyRecord[] = [];
  let rowLevelSwapsCount = 0;

  rows.forEach((row: any, index: number) => {
    let companyName = (mapping.companyNameKey ? row[mapping.companyNameKey] : '').toString().trim();
    let companyNumber = (mapping.companyNumberKey ? row[mapping.companyNumberKey] : '').toString().trim();
    let countyRaw = (mapping.countyKey ? row[mapping.countyKey] : '').toString().trim();
    let county = extractIrishCountyFromText(
      countyRaw,
      row['company_address_4'],
      row['company_address_3'],
      row['company_address_2'],
      row['company_address_1'],
      row['Address4'],
      row['Address 4'],
      row['County']
    );

    const dmName = mapping.decisionMakerNameKey ? (row[mapping.decisionMakerNameKey] || '').toString().trim() : undefined;
    const dmRole = mapping.decisionMakerRoleKey ? (row[mapping.decisionMakerRoleKey] || '').toString().trim() : undefined;

    if (applyRowHealing) {
      if (isNumericCroNumber(companyName) && isCompanyName(companyNumber)) {
        const temp = companyName;
        companyName = companyNumber;
        companyNumber = temp;
        rowLevelSwapsCount++;
      }
      if (isCountyName(companyName) && isCompanyName(county)) {
        const temp = companyName;
        companyName = county;
        county = temp;
        rowLevelSwapsCount++;
      }
    }

    if (!county || !isCountyName(county)) {
      if (!county) county = 'Ireland';
    }

    if (companyName) {
      records.push({
        id: `record-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 7)}`,
        companyNumber: companyNumber || getDedupKey(undefined, companyName, county),
        companyName,
        county,
        eircode: extractEircodeFromRow(row),
        status: 'PENDING',
        official_website_url: null,
        decisionMakerName: dmName || null,
        decisionMakerRole: dmRole || null,
        confidence_score: 'NONE',
        match_type: 'UNPROCESSED',
        rawRowData: row,
        originalHeaders: Object.keys(row),
      });
    }
  });

  if (rowLevelSwapsCount > 0) {
    autoCorrections.push(
      `✨ Smart Row Healing: Automatically corrected ${rowLevelSwapsCount} misaligned cells where Name and CRO Number/County were inverted.`
    );
  }

  return { records, autoCorrections };
}

/**
 * Merges the output of extractRecordsWithCustomMapping back onto an existing
 * dataset instead of replacing it wholesale. extractRecordsWithCustomMapping
 * only knows about the 5 fields the mapping modal exposes (name, CRO number,
 * county, decision-maker name/role) and builds brand-new CompanyRecord
 * objects — using its output directly as the new dataset would silently drop
 * every enrichment field (website, industry, phone, email, etc.) and mint a
 * fresh id per record. Correlates each relabeled record back to its source
 * via rawRowData.__recordId (attached by the caller before extraction) and
 * spreads the relabeled fields onto a copy of the original record.
 */
export function mergeRelabeledRecords(
  original: CompanyRecord[],
  relabeledRecords: CompanyRecord[]
): CompanyRecord[] {
  const byId = new Map<string, CompanyRecord>(original.map((r) => [r.id, r]));
  return relabeledRecords.map((nr) => {
    const originalId = nr.rawRowData?.__recordId;
    const match = originalId ? byId.get(originalId) : undefined;
    if (!match) {
      // No source record found — return the extracted record as-is, but strip
      // the internal __recordId tracking key so it can never leak into a CSV
      // export column via rawRowData.
      if (nr.rawRowData && '__recordId' in nr.rawRowData) {
        const { __recordId, ...rest } = nr.rawRowData;
        return { ...nr, rawRowData: rest };
      }
      return nr;
    }
    const changed =
      match.companyName !== nr.companyName ||
      match.companyNumber !== nr.companyNumber ||
      match.county !== nr.county ||
      (match.decisionMakerName || null) !== (nr.decisionMakerName || null) ||
      (match.decisionMakerRole || null) !== (nr.decisionMakerRole || null);
    if (!changed) return match;
    return {
      ...match,
      companyName: nr.companyName,
      companyNumber: nr.companyNumber,
      county: nr.county,
      decisionMakerName: nr.decisionMakerName,
      decisionMakerRole: nr.decisionMakerRole,
      isManualEdit: true,
    };
  });
}

export function parseCSVFile(file: File): Promise<{ records: CompanyRecord[]; errors: string[]; autoCorrections: string[] }> {
  return new Promise((resolve) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const errors: string[] = [];

        if (!results.data || results.data.length === 0) {
          resolve({ records: [], errors: ['CSV file is empty or could not be parsed.'], autoCorrections: [] });
          return;
        }

        const headers = results.meta.fields || [];
        const { records, autoCorrections } = smartExtractAndHealRecords(results.data, headers);

        if (records.length === 0) {
          errors.push('No valid business rows found in CSV.');
        }

        resolve({ records, errors, autoCorrections });
      },
      error: (error) => {
        resolve({ records: [], errors: [error.message || 'Error parsing CSV file.'], autoCorrections: [] });
      },
    });
  });
}

export function generateSampleCSVString(): string {
  const data = [
    { CompanyNumber: '308222', CompanyName: 'Glanbia PLC', Address4: 'Kilkenny' },
    { CompanyNumber: '206631', CompanyName: 'Kerry Group PLC', Address4: 'Kerry' },
    { CompanyNumber: '096001', CompanyName: 'SuperValu Ireland', Address4: 'Cork' },
    { CompanyNumber: '018600', CompanyName: 'Pat The Baker', Address4: 'Longford' },
    { CompanyNumber: '083412', CompanyName: 'Carbery Group', Address4: 'Cork' },
    { CompanyNumber: '112040', CompanyName: 'Monaghan Mushrooms', Address4: 'Monaghan' },
    { CompanyNumber: '284019', CompanyName: 'FBD Insurance', Address4: 'Dublin' },
    { CompanyNumber: '341098', CompanyName: 'C&C Group PLC', Address4: 'Dublin' },
    { CompanyNumber: '045922', CompanyName: 'Galway Bay Brewery', Address4: 'Galway' },
    { CompanyNumber: '512003', CompanyName: 'Bord Gáis Energy', Address4: 'Dublin' },
  ];

  return Papa.unparse(data);
}

export function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportRecordsToCSV(records: CompanyRecord[], filterProcessedOnly: boolean = false): string {
  const filtered = filterProcessedOnly
    ? records.filter((r) => r.status === 'SUCCESS')
    : records;

  if (filtered.length === 0) return '';

  const csvRows = filtered.map((r) => {
    // If original raw data exists, preserve exact incoming file column structure first
    const baseRow: Record<string, any> = r.rawRowData ? { ...r.rawRowData } : {
      company_num: r.companyNumber,
      company_name: r.companyName,
      company_status_code: '1151',
      company_status: 'Normal',
      company_type_code: '1153',
      company_type: 'LTD - Private Company Limited by Shares',
      company_reg_date: '',
      last_ar_date: '',
      company_address_1: '',
      company_address_2: '',
      company_address_3: '',
      company_address_4: r.county,
      comp_dissolved_date: '',
      nard: '',
      last_accounts_date: '',
      company_status_date: '',
      nace_v2_code: '',
      eircode: '',
      company_name_eff_date: '',
      company_type_eff_date: '',
      princ_object_code: '',
      scrape_verified: '0',
      cro_verified: '1',
      cro_number: r.companyNumber,
      raw_json: '',
      dedupe_key: `${r.companyName.toLowerCase()}|${r.county.toLowerCase()}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Append enriched columns in strict predictable sequence
    baseRow['official_website_url'] = r.official_website_url || 'N/A';
    baseRow['confidence_score'] = r.confidence_score;
    baseRow['match_type'] = r.match_type;
    baseRow['status'] = r.status;
    baseRow['notes'] = r.notes || '';
    baseRow['decisionMakerName'] = cleanNullableField(r.decisionMakerName) || 'N/A';
    baseRow['decisionMakerRole'] = cleanNullableField(r.decisionMakerRole) || 'N/A';
    baseRow['phoneNumber'] = cleanNullableField(r.phoneNumber) || 'N/A';
    baseRow['contactEmail'] = cleanNullableField(r.contactEmail) || 'N/A';

    return baseRow;
  });

  return Papa.unparse(csvRows);
}

