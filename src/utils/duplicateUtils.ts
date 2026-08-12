import { CompanyRecord } from '../types';

export interface DuplicateGroup {
  companyNumber: string;
  normalizedNumber: string;
  records: CompanyRecord[];
}

export interface DuplicateAnalysisResult {
  hasDuplicates: boolean;
  totalDuplicatesCount: number;
  uniqueCompanyNumbersCount: number;
  duplicateGroups: DuplicateGroup[];
  duplicateRecordIds: Set<string>;
}

export function analyzeDuplicates(records: CompanyRecord[]): DuplicateAnalysisResult {
  const groupsMap = new Map<string, CompanyRecord[]>();

  records.forEach((record) => {
    if (!record.companyNumber) return;
    const norm = record.companyNumber.toString().trim().toLowerCase();
    if (!norm) return;

    if (!groupsMap.has(norm)) {
      groupsMap.set(norm, []);
    }
    groupsMap.get(norm)!.push(record);
  });

  const duplicateGroups: DuplicateGroup[] = [];
  const duplicateRecordIds = new Set<string>();
  let totalDuplicatesCount = 0;

  groupsMap.forEach((groupRecords, norm) => {
    if (groupRecords.length > 1) {
      duplicateGroups.push({
        companyNumber: groupRecords[0].companyNumber,
        normalizedNumber: norm,
        records: groupRecords,
      });
      totalDuplicatesCount += groupRecords.length - 1;
      groupRecords.forEach((r) => duplicateRecordIds.add(r.id));
    }
  });

  return {
    hasDuplicates: duplicateGroups.length > 0,
    totalDuplicatesCount,
    uniqueCompanyNumbersCount: duplicateGroups.length,
    duplicateGroups,
    duplicateRecordIds,
  };
}

export function deduplicateDataset(records: CompanyRecord[]): {
  cleanedRecords: CompanyRecord[];
  removedCount: number;
  removedRecords: CompanyRecord[];
} {
  const cleanedRecords: CompanyRecord[] = [];
  const removedRecords: CompanyRecord[] = [];

  const scoreRecord = (r: CompanyRecord): number => {
    let score = 0;
    if (r.status === 'SUCCESS') score += 100;
    if (r.official_website_url) score += 50;
    if (r.match_type === 'OFFICIAL_WEBSITE') score += 30;
    if (r.phoneNumber) score += 10;
    if (r.contactEmail) score += 10;
    return score;
  };

  const groups = new Map<string, CompanyRecord[]>();
  records.forEach((r) => {
    const norm = (r.companyNumber || '').toString().trim().toLowerCase();
    const key = norm || r.id;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(r);
  });

  groups.forEach((groupRecords, key) => {
    if (groupRecords.length === 1 || !key) {
      cleanedRecords.push(...groupRecords);
    } else {
      const sorted = [...groupRecords].sort((a, b) => scoreRecord(b) - scoreRecord(a));
      const bestRecord = sorted[0];
      cleanedRecords.push(bestRecord);
      sorted.slice(1).forEach((r) => removedRecords.push(r));
    }
  });

  const cleanedIds = new Set(cleanedRecords.map((r) => r.id));
  const orderedCleaned = records.filter((r) => cleanedIds.has(r.id));

  return {
    cleanedRecords: orderedCleaned,
    removedCount: removedRecords.length,
    removedRecords,
  };
}
