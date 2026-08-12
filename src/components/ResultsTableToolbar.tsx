import React from "react";
import {
  Search, Filter, X, AlertCircle, CheckCircle2,
} from "lucide-react";
import { FilterState } from "../types";
import { DuplicateAnalysisResult } from "../utils/duplicateUtils";

interface ResultsTableToolbarProps {
  filters: FilterState;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
  showOnlyDuplicates: boolean;
  setShowOnlyDuplicates: (value: boolean) => void;
  duplicateAnalysis: DuplicateAnalysisResult;
  successfulMatchesCount: number;
  counties: string[];
  totalCount: number;
  filteredCount: number;
  resetFilters: () => void;
  hasActiveFilters: boolean;
}

/**
 * Filter toolbar for the ResultsTable.
 * Extracts the search box, filter dropdowns, toggle buttons,
 * and active filter chips from the main ResultsTable component.
 */
export const ResultsTableToolbar: React.FC<ResultsTableToolbarProps> = ({
  filters,
  setFilters,
  showOnlyDuplicates,
  setShowOnlyDuplicates,
  duplicateAnalysis,
  successfulMatchesCount,
  counties,
  totalCount,
  filteredCount,
  resetFilters,
  hasActiveFilters,
}) => {
  return (
    <div className="mt-4 pt-3.5 border-t border-char-light space-y-3 bg-void/40 -mx-6 px-6 py-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 bg-gold/10 text-gold rounded-md">
            <Filter className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-bold text-ash uppercase tracking-wider">Filter Dataset</span>
          <span className="text-[11px] font-semibold text-smoke bg-char px-2 py-0.5 rounded-full border border-char-light font-mono">
            Showing {filteredCount} of {totalCount}
          </span>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          {duplicateAnalysis.hasDuplicates && (
            <button
              type="button"
              onClick={() => setShowOnlyDuplicates(!showOnlyDuplicates)}
              className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold border transition-all cursor-pointer ${
                showOnlyDuplicates
                  ? "bg-ember text-void border-ember"
                  : "bg-ember/10 text-ember border-ember/30 hover:bg-ember/20"
              }`}
            >
              <AlertCircle className="w-3.5 h-3.5 mr-1.5" />
              <span>Duplicates Only</span>
              <span className={`ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                showOnlyDuplicates ? "bg-void/30 text-void" : "bg-ember/20 text-ember"
              }`}>
                {duplicateAnalysis.totalDuplicatesCount}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setFilters((prev) => ({ ...prev, showOnlySuccessful: !prev.showOnlySuccessful }))}
            className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold border transition-all cursor-pointer ${
              filters.showOnlySuccessful
                ? "bg-gold text-void border-gold"
                : "bg-void/60 text-ash border-char-light hover:border-gold/40"
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
            <span>Show Only Successful</span>
            <span className={`ml-2 px-1.5 py-0.2 rounded-full text-[10px] font-black ${
              filters.showOnlySuccessful ? "bg-void/30 text-void" : "bg-char-light text-smoke"
            }`}>
              {successfulMatchesCount}
            </span>
          </button>

          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="px-2.5 py-1.5 text-xs font-bold text-smoke hover:text-ember bg-void/60 hover:bg-ember/10 border border-char-light rounded-full transition-colors flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" /> Reset All
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-smoke absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search name, CRO, decision maker..."
            value={filters.searchTerm}
            onChange={(e) => setFilters({ ...filters, searchTerm: e.target.value })}
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-char-light rounded-lg bg-void/60 text-ash placeholder:text-smoke focus:ring-2 focus:ring-gold/40 focus:border-gold/50 font-medium"
          />
        </div>

        <div className="relative">
          <select
            value={filters.statusFilter}
            onChange={(e) => setFilters({ ...filters, statusFilter: e.target.value as any })}
            className={`w-full px-2.5 py-1.5 text-xs border rounded-lg bg-void/60 focus:ring-2 focus:ring-gold/40 focus:border-gold/50 font-semibold ${
              filters.statusFilter !== "ALL" ? "border-gold/50 text-gold" : "border-char-light text-ash"
            }`}
          >
            <option value="ALL">Status: All</option>
            <option value="SUCCESS">Success / Enriched</option>
            <option value="FAILED">Failed</option>
            <option value="PENDING">Pending Batch</option>
          </select>
        </div>

        <div className="relative">
          <select
            value={filters.confidenceFilter}
            onChange={(e) => setFilters({ ...filters, confidenceFilter: e.target.value as any })}
            className={`w-full px-2.5 py-1.5 text-xs border rounded-lg bg-void/60 focus:ring-2 focus:ring-gold/40 focus:border-gold/50 font-semibold ${
              filters.confidenceFilter !== "ALL" ? "border-gold/50 text-gold" : "border-char-light text-ash"
            }`}
          >
            <option value="ALL">Confidence: All</option>
            <option value="HIGH">High Confidence</option>
            <option value="MEDIUM">Medium Confidence</option>
            <option value="LOW">Low Confidence</option>
          </select>
        </div>

        <div className="relative">
          <select
            value={filters.matchTypeFilter}
            onChange={(e) => setFilters({ ...filters, matchTypeFilter: e.target.value as any })}
            className={`w-full px-2.5 py-1.5 text-xs border rounded-lg bg-void/60 focus:ring-2 focus:ring-gold/40 focus:border-gold/50 font-semibold ${
              filters.matchTypeFilter !== "ALL" ? "border-gold/50 text-gold" : "border-char-light text-ash"
            }`}
          >
            <option value="ALL">Match Type: All</option>
            <option value="OFFICIAL_WEBSITE">Official Website</option>
            <option value="FACEBOOK_FALLBACK">Facebook Fallback</option>
            <option value="LIGHT_SWEEP_COMPLETE">Light Sweep Match</option>
            <option value="SHARED_DOMAIN">Shared Domain</option>
            <option value="NOT_FOUND">Not Found / Excluded</option>
            <option value="UNPROCESSED">Unprocessed</option>
          </select>
        </div>

        <div className="relative">
          <select
            value={filters.countyFilter}
            onChange={(e) => setFilters({ ...filters, countyFilter: e.target.value })}
            className={`w-full px-2.5 py-1.5 text-xs border rounded-lg bg-void/60 focus:ring-2 focus:ring-gold/40 focus:border-gold/50 font-semibold ${
              filters.countyFilter !== "ALL" ? "border-gold/50 text-gold" : "border-char-light text-ash"
            }`}
          >
            <option value="ALL">County: All ({counties.length})</option>
            {counties.map((county) => (
              <option key={county} value={county}>
                County {county}
              </option>
            ))}
          </select>
        </div>
      </div>

      {(filters.statusFilter !== "ALL" || filters.confidenceFilter !== "ALL" || filters.matchTypeFilter !== "ALL" || filters.countyFilter !== "ALL" || filters.searchTerm) && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
          <span className="font-semibold text-smoke">Active filters:</span>

          {filters.statusFilter !== "ALL" && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gold/10 text-gold font-semibold border border-gold/30">
              Status: {filters.statusFilter}
              <button onClick={() => setFilters({ ...filters, statusFilter: "ALL" })} className="hover:text-ash cursor-pointer">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {filters.confidenceFilter !== "ALL" && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-void/60 text-ash font-semibold border border-char-light">
              Confidence: {filters.confidenceFilter}
              <button onClick={() => setFilters({ ...filters, confidenceFilter: "ALL" })} className="hover:text-gold cursor-pointer">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {filters.matchTypeFilter !== "ALL" && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-void/60 text-ash font-semibold border border-char-light">
              Match: {filters.matchTypeFilter.replace("_", " ")}
              <button onClick={() => setFilters({ ...filters, matchTypeFilter: "ALL" })} className="hover:text-gold cursor-pointer">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {filters.countyFilter !== "ALL" && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-void/60 text-ash font-semibold border border-char-light">
              County: {filters.countyFilter}
              <button onClick={() => setFilters({ ...filters, countyFilter: "ALL" })} className="hover:text-gold cursor-pointer">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {filters.searchTerm && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-void/60 text-ash font-semibold border border-char-light">
              Search: "{filters.searchTerm}"
              <button onClick={() => setFilters({ ...filters, searchTerm: "" })} className="hover:text-gold cursor-pointer">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  );
};
