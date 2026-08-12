import { useState, useMemo } from "react";
import { CompanyRecord, FilterState } from "../types";
import { analyzeDuplicates } from "../utils/duplicateUtils";
import { cleanNullableField } from "../utils/normalize";

/**
 * Whether a record matches a free-text search term across its searchable
 * fields. Pure and side-effect-free so it can be unit-tested directly.
 * decisionMakerName/decisionMakerRole are compared via cleanNullableField
 * so a legacy literal "null" string never matches a search for "null".
 */
export function recordMatchesSearch(r: CompanyRecord, term: string): boolean {
  const lowerTerm = term.toLowerCase();
  const cleanedDecisionMakerName = cleanNullableField(r.decisionMakerName);
  const cleanedDecisionMakerRole = cleanNullableField(r.decisionMakerRole);

  return (
    r.companyName.toLowerCase().includes(lowerTerm) ||
    r.companyNumber.toLowerCase().includes(lowerTerm) ||
    !!r.official_website_url?.toLowerCase().includes(lowerTerm) ||
    !!r.notes?.toLowerCase().includes(lowerTerm) ||
    !!cleanedDecisionMakerName?.toLowerCase().includes(lowerTerm) ||
    !!cleanedDecisionMakerRole?.toLowerCase().includes(lowerTerm) ||
    !!r.linkedinUrl?.toLowerCase().includes(lowerTerm)
  );
}

const DEFAULT_FILTERS: FilterState = {
  searchTerm: "",
  countyFilter: "ALL",
  statusFilter: "ALL",
  matchTypeFilter: "ALL",
  confidenceFilter: "ALL",
  showOnlySuccessful: false,
};

/**
 * Encapsulates all filtering logic for the ResultsTable.
 *
 * Extracts filter state, filtered records memo, duplicate analysis,
 * and selection management from the 898-line ResultsTable component.
 */
export function useTableFilters(records: CompanyRecord[]) {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [showOnlyDuplicates, setShowOnlyDuplicates] = useState<boolean>(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const duplicateAnalysis = useMemo(() => analyzeDuplicates(records), [records]);

  const successfulMatchesCount = useMemo(
    () => records.filter((r) => r.status === "SUCCESS" && r.official_website_url).length,
    [records]
  );

  const counties = useMemo(() => {
    const set = new Set<string>();
    records.forEach((r) => {
      if (r.county) set.add(r.county);
    });
    return Array.from(set).sort();
  }, [records]);

  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      if (showOnlyDuplicates && !duplicateAnalysis.duplicateRecordIds.has(r.id)) return false;
      if (filters.showOnlySuccessful && (r.status !== "SUCCESS" || !r.official_website_url)) return false;

      if (filters.searchTerm && !recordMatchesSearch(r, filters.searchTerm)) {
        return false;
      }

      if (filters.countyFilter !== "ALL" && r.county !== filters.countyFilter) return false;
      if (filters.matchTypeFilter !== "ALL" && r.match_type !== filters.matchTypeFilter) return false;
      if (filters.statusFilter !== "ALL" && r.status !== filters.statusFilter) return false;
      if (filters.confidenceFilter !== "ALL" && r.confidence_score !== filters.confidenceFilter) return false;

      return true;
    });
  }, [records, filters, showOnlyDuplicates, duplicateAnalysis]);

  const allFilteredSelected =
    filteredRecords.length > 0 && filteredRecords.every((r) => selectedIds.has(r.id));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredRecords.map((r) => r.id)));
    }
  };

  const toggleSelectRecord = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const resetFilters = () => {
    setShowOnlyDuplicates(false);
    setFilters(DEFAULT_FILTERS);
  };

  const hasActiveFilters =
    filters.showOnlySuccessful ||
    showOnlyDuplicates ||
    !!filters.searchTerm ||
    filters.countyFilter !== "ALL" ||
    filters.matchTypeFilter !== "ALL" ||
    filters.statusFilter !== "ALL" ||
    filters.confidenceFilter !== "ALL";

  return {
    filters,
    setFilters,
    showOnlyDuplicates,
    setShowOnlyDuplicates,
    selectedIds,
    setSelectedIds,
    filteredRecords,
    duplicateAnalysis,
    successfulMatchesCount,
    counties,
    allFilteredSelected,
    toggleSelectAll,
    toggleSelectRecord,
    resetFilters,
    hasActiveFilters,
  };
}
