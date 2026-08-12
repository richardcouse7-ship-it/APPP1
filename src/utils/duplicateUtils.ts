import { CompanyRecord } from '../types';
import { getDedupKey, cleanNullableField } from './normalize';
import { areFuzzyDuplicates } from './fuzzyMatch';

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

  // Phase 1: Exact dedup key grouping (CRO number or normalized name+county)
  records.forEach((record) => {
    const norm = getDedupKey(record.companyNumber, record.companyName, record.county);
    if (!norm) return;

    if (!groupsMap.has(norm)) {
      groupsMap.set(norm, []);
    }
    groupsMap.get(norm)!.push(record);
  });

  // Phase 2: Fuzzy matching for records without CRO numbers
  // Compare records that have no company number against each other
  const noCroRecords = records.filter((r) => !r.companyNumber || !r.companyNumber.trim());
  const mergedIds = new Set<string>(); // Track records already merged via fuzzy match

  for (let i = 0; i < noCroRecords.length; i++) {
    if (mergedIds.has(noCroRecords[i].id)) continue;
    for (let j = i + 1; j < noCroRecords.length; j++) {
      if (mergedIds.has(noCroRecords[j].id)) continue;
      if (areFuzzyDuplicates(
        noCroRecords[i].companyName, noCroRecords[i].county,
        noCroRecords[j].companyName, noCroRecords[j].county
      )) {
        // Merge j into i's group
        const keyI = getDedupKey(noCroRecords[i].companyNumber, noCroRecords[i].companyName, noCroRecords[i].county);
        const keyJ = getDedupKey(noCroRecords[j].companyNumber, noCroRecords[j].companyName, noCroRecords[j].county);
        const groupI = groupsMap.get(keyI) || [noCroRecords[i]];
        const groupJ = groupsMap.get(keyJ) || [noCroRecords[j]];

        // Merge groupJ into groupI
        const merged = [...groupI, ...groupJ];
        groupsMap.set(keyI, merged);
        groupsMap.delete(keyJ);
        mergedIds.add(noCroRecords[j].id);
      }
    }
  }

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
    if (cleanNullableField(r.phoneNumber)) score += 10;
    if (cleanNullableField(r.contactEmail)) score += 10;
    return score;
  };

  const groups = new Map<string, CompanyRecord[]>();
  records.forEach((r) => {
    const key = getDedupKey(r.companyNumber, r.companyName, r.county);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(r);
  });

  // Also apply fuzzy matching for dedup
  const noCroRecords = records.filter((r) => !r.companyNumber || !r.companyNumber.trim());
  const fuzzyMerged = new Set<string>();

  for (let i = 0; i < noCroRecords.length; i++) {
    if (fuzzyMerged.has(noCroRecords[i].id)) continue;
    for (let j = i + 1; j < noCroRecords.length; j++) {
      if (fuzzyMerged.has(noCroRecords[j].id)) continue;
      if (areFuzzyDuplicates(
        noCroRecords[i].companyName, noCroRecords[i].county,
        noCroRecords[j].companyName, noCroRecords[j].county
      )) {
        const keyI = getDedupKey(noCroRecords[i].companyNumber, noCroRecords[i].companyName, noCroRecords[i].county);
        const keyJ = getDedupKey(noCroRecords[j].companyNumber, noCroRecords[j].companyName, noCroRecords[j].county);
        const groupI = groups.get(keyI) || [noCroRecords[i]];
        const groupJ = groups.get(keyJ) || [noCroRecords[j]];
        const merged = [...groupI, ...groupJ];
        groups.set(keyI, merged);
        groups.delete(keyJ);
        fuzzyMerged.add(noCroRecords[j].id);
      }
    }
  }

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
