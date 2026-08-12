import { CompanyRecord } from '../types';
import { smartExtractAndHealRecords } from '../utils/csvUtils';
import { getValidAccessToken, refreshAccessToken } from '../lib/firebaseAuth';
import { cleanNullableField } from '../utils/normalize';

/**
 * Thrown when a Drive/Sheets request fails auth even after a token refresh
 * attempt — the caller should prompt the user to reconnect their Google account.
 */
export class GoogleAuthExpiredError extends Error {
  constructor(message = 'Your Google session has expired. Please reconnect your Google account.') {
    super(message);
    this.name = 'GoogleAuthExpiredError';
  }
}

/**
 * Runs an authorized Drive/Sheets fetch, transparently refreshing the access
 * token on a 401 and retrying once before giving up.
 */
async function authorizedFetch(url: string, init: RequestInit, accessToken: string): Promise<Response> {
  const buildInit = (token: string): RequestInit => ({
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` },
  });

  let token = (await getValidAccessToken()) || accessToken;
  let res = await fetch(url, buildInit(token));

  if (res.status === 401) {
    const refreshed = await refreshAccessToken(false);
    if (refreshed) {
      res = await fetch(url, buildInit(refreshed));
    }
    if (res.status === 401) {
      throw new GoogleAuthExpiredError();
    }
  }

  return res;
}

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  webViewLink?: string;
}

export interface ExportSheetResult {
  spreadsheetId: string;
  spreadsheetUrl: string;
  title: string;
}

export const SHEET_HEADERS = [
  'CRO Reg #',
  'Business Name',
  'County',
  'Official Website URL',
  'Decision Maker Name',
  'Decision Maker Role',
  'LinkedIn URL',
  'LinkedIn Type',
  'Industry / Sector',
  'Company Overview',
  'Phone',
  'Contact Email',
  'Lead Verification Status',
  'Confidence Score',
  'Match Type',
  'Process Status',
  'Research Notes',
  'Processed At',
];

/**
 * Builds the Google Sheets row data for an export. Pure and side-effect-free
 * so it can be unit-tested without a live Sheets API call.
 */
export function buildSheetRows(records: CompanyRecord[]): (string)[][] {
  return records.map((r) => [
    r.companyNumber || '',
    r.companyName || '',
    r.county || '',
    r.official_website_url || 'N/A',
    cleanNullableField(r.decisionMakerName) || 'N/A',
    cleanNullableField(r.decisionMakerRole) || 'N/A',
    r.linkedinUrl || 'N/A',
    r.linkedinType === 'DECISION_MAKER' ? 'Decision Maker Profile' : r.linkedinType === 'COMPANY' ? 'Company LinkedIn Page' : 'Not Found',
    cleanNullableField(r.industry) || 'N/A',
    cleanNullableField(r.companySummary) || 'N/A',
    cleanNullableField(r.phoneNumber) || 'N/A',
    cleanNullableField(r.contactEmail) || 'N/A',
    r.verificationStatus || 'UNPROCESSED',
    r.confidence_score || 'NONE',
    r.match_type || 'UNPROCESSED',
    r.status || 'PENDING',
    r.notes || '',
    r.processedAt ? new Date(r.processedAt).toLocaleString('en-IE') : '',
  ]);
}

/**
 * Creates a new Google Sheet in the user's Google Drive and populates it with enriched leads data.
 */
export async function exportLeadsToGoogleSheets(
  accessToken: string,
  title: string,
  records: CompanyRecord[]
): Promise<ExportSheetResult> {
  if (!accessToken) {
    throw new Error('Google authentication required. Please sign in with Google.');
  }

  // 1. Create a new Spreadsheet
  const createRes = await authorizedFetch(
    'https://sheets.googleapis.com/v4/spreadsheets',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        properties: {
          title: title || `Irish B2B Verified Leads - ${new Date().toLocaleDateString('en-IE')}`,
        },
      }),
    },
    accessToken
  );

  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to create Google Sheet (HTTP ${createRes.status})`);
  }

  const sheetData = await createRes.json();
  const spreadsheetId = sheetData.spreadsheetId;
  const spreadsheetUrl = sheetData.spreadsheetUrl;

  // 2. Prepare Rows Data
  const headers = SHEET_HEADERS;
  const rows = buildSheetRows(records);
  const valueData = [headers, ...rows];

  // 3. Append Data to Sheet1
  const updateRes = await authorizedFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A1:R${valueData.length}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        values: valueData,
      }),
    },
    accessToken
  );

  if (!updateRes.ok) {
    const err = await updateRes.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Failed to write data into Google Sheet.');
  }

  return {
    spreadsheetId,
    spreadsheetUrl,
    title,
  };
}

/**
 * Lists Google Sheets files from the user's Google Drive.
 */
export async function listUserGoogleSheets(accessToken: string): Promise<DriveFileItem[]> {
  if (!accessToken) return [];

  const query = "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false";
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,modifiedTime,webViewLink)&pageSize=30&orderBy=modifiedTime desc`;

  const res = await authorizedFetch(url, {}, accessToken);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Failed to search Google Drive.');
  }

  const data = await res.json();
  return data.files || [];
}

/**
 * Imports leads from a user's Google Sheet file into CompanyRecord format with smart column auto-healing.
 */
export async function importLeadsFromGoogleSheet(
  accessToken: string,
  spreadsheetId: string
): Promise<{ records: CompanyRecord[]; autoCorrections: string[] }> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1:Z500`;

  const res = await authorizedFetch(url, {}, accessToken);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Failed to read Google Sheet values.');
  }

  const data = await res.json();
  const values: string[][] = data.values || [];

  if (values.length < 2) {
    throw new Error('Selected Google Sheet contains no data rows.');
  }

  const rawHeaders = values[0].map((h, i) => (h && h.trim() ? h.trim() : `Column_${i + 1}`));

  // Convert 2D values array to row objects
  const rowObjects = values.slice(1).map((row) => {
    const obj: Record<string, string> = {};
    rawHeaders.forEach((header, index) => {
      obj[header] = (row[index] || '').toString().trim();
    });
    return obj;
  });

  const { records, autoCorrections } = smartExtractAndHealRecords(rowObjects, rawHeaders);

  return { records, autoCorrections };
}
