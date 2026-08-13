import React, { useState, useMemo } from 'react';
import {
  Search, Download, ExternalLink, Globe, Facebook, AlertCircle, Copy, Check,
  Filter, Eye, Edit3, Sparkles, RefreshCw, Trash2, CheckSquare, Square,
  ArrowUpDown, FileDown, ShieldAlert, CheckCircle2, ChevronRight, Phone, Mail, Building, Building2,
  FileSpreadsheet, X, UserCheck, Linkedin, SlidersHorizontal
} from 'lucide-react';
import { CompanyRecord, FilterState, MatchType } from '../types';
import { exportRecordsToCSV, downloadCSV } from '../utils/csvUtils';
import { exportLeadsToGoogleSheets, ExportSheetResult } from '../services/workspaceService';
import { analyzeDuplicates } from '../utils/duplicateUtils';
import { User } from 'firebase/auth';
import { EditRowModal } from './EditRowModal';

interface ResultsTableProps {
  records: CompanyRecord[];
  onSelectCompany: (company: CompanyRecord) => void;
  onReEnrichSingle: (company: CompanyRecord) => void;
  onDeleteRecords: (ids: string[]) => void;
  onResetRecordStatus: (ids: string[]) => void;
  onEditRecord: (updatedRecord: CompanyRecord) => void;
  onOpenColumnMapping?: () => void;
  isProcessingBatch: boolean;
  user: User | null;
  accessToken: string | null;
  onGoogleSignIn: () => void;
}

export const ResultsTable: React.FC<ResultsTableProps> = ({
  records,
  onSelectCompany,
  onReEnrichSingle,
  onDeleteRecords,
  onResetRecordStatus,
  onEditRecord,
  onOpenColumnMapping,
  isProcessingBatch,
  user,
  accessToken,
  onGoogleSignIn,
}) => {
  const [editingRecord, setEditingRecord] = useState<CompanyRecord | null>(null);
  const [qualificationFilter, setQualificationFilter] = useState<'ALL' | 'QUALIFIED' | 'DISQUALIFIED' | 'NEEDS_REVIEW' | 'UNSCREENED'>('ALL');
  const [filters, setFilters] = useState<FilterState>({
    searchTerm: '',
    countyFilter: 'ALL',
    statusFilter: 'ALL',
    matchTypeFilter: 'ALL',
    confidenceFilter: 'ALL',
    showOnlySuccessful: false,
  });

  const [showOnlyDuplicates, setShowOnlyDuplicates] = useState<boolean>(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Analyze duplicates
  const duplicateAnalysis = useMemo(() => {
    return analyzeDuplicates(records);
  }, [records]);

  // Google Sheets export state
  const [isExportingSheet, setIsExportingSheet] = useState(false);
  const [exportSheetResult, setExportSheetResult] = useState<ExportSheetResult | null>(null);
  const [exportSheetError, setExportSheetError] = useState<string | null>(null);

  // Count of successful website matches
  const successfulMatchesCount = useMemo(() => {
    return records.filter((r) => r.status === 'SUCCESS' && r.official_website_url).length;
  }, [records]);

  // Extract unique counties for dropdown filter
  const counties = useMemo(() => {
    const set = new Set<string>();
    records.forEach((r) => {
      if (r.county) set.add(r.county);
    });
    return Array.from(set).sort();
  }, [records]);

  // Filtered dataset
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      // Qualification Filter
      if (qualificationFilter !== 'ALL') {
        const qStatus = r.qualificationStatus || 'UNSCREENED';
        if (qStatus !== qualificationFilter) return false;
      }

      // Toggle: Show Only Duplicates
      if (showOnlyDuplicates) {
        if (!duplicateAnalysis.duplicateRecordIds.has(r.id)) return false;
      }

      // Toggle: Show Only Successful Matches
      if (filters.showOnlySuccessful) {
        if (r.status !== 'SUCCESS' || !r.official_website_url) return false;
      }

      // Search Term
      if (filters.searchTerm) {
        const term = filters.searchTerm.toLowerCase();
        const matchesName = r.companyName.toLowerCase().includes(term);
        const matchesNumber = r.companyNumber.toLowerCase().includes(term);
        const matchesUrl = r.official_website_url?.toLowerCase().includes(term);
        const matchesNotes = r.notes?.toLowerCase().includes(term);
        const matchesDmName = r.decisionMakerName?.toLowerCase().includes(term);
        const matchesDmRole = r.decisionMakerRole?.toLowerCase().includes(term);
        const matchesLinkedin = r.linkedinUrl?.toLowerCase().includes(term);
        if (!matchesName && !matchesNumber && !matchesUrl && !matchesNotes && !matchesDmName && !matchesDmRole && !matchesLinkedin) return false;
      }

      // County Filter
      if (filters.countyFilter !== 'ALL' && r.county !== filters.countyFilter) {
        return false;
      }

      // Match Type Filter
      if (filters.matchTypeFilter !== 'ALL' && r.match_type !== filters.matchTypeFilter) {
        return false;
      }

      // Status Filter
      if (filters.statusFilter !== 'ALL' && r.status !== filters.statusFilter) {
        return false;
      }

      // Confidence Score Filter
      if (filters.confidenceFilter !== 'ALL' && r.confidence_score !== filters.confidenceFilter) {
        return false;
      }

      return true;
    });
  }, [records, filters]);

  // Select all toggle
  const allFilteredSelected = filteredRecords.length > 0 && filteredRecords.every((r) => selectedIds.has(r.id));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
    } else {
      const newSet = new Set<string>(filteredRecords.map((r) => r.id));
      setSelectedIds(newSet);
    }
  };

  const toggleSelectRecord = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const handleCopyUrl = (url: string, id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDownloadMasterCSV = (processedOnly: boolean = false) => {
    const recordsToExport = selectedIds.size > 0
      ? records.filter((r) => selectedIds.has(r.id))
      : processedOnly
        ? filteredRecords.filter((r) => r.status === 'SUCCESS' && r.official_website_url)
        : filteredRecords;

    const csvContent = exportRecordsToCSV(recordsToExport, false);
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = (processedOnly || filters.showOnlySuccessful)
      ? `irish_b2b_websites_successful_${dateStr}.csv`
      : `irish_b2b_master_dataset_${dateStr}.csv`;
    downloadCSV(csvContent, filename);
  };

  const handleExportToGoogleSheets = async () => {
    if (!accessToken) {
      onGoogleSignIn();
      return;
    }

    setIsExportingSheet(true);
    setExportSheetError(null);

    try {
      const recordsToExport = selectedIds.size > 0
        ? records.filter((r) => selectedIds.has(r.id))
        : filteredRecords;

      const title = filters.showOnlySuccessful
        ? `Irish B2B Successful Matches (${recordsToExport.length}) - ${new Date().toLocaleDateString('en-IE')}`
        : `Irish B2B Verified Leads - ${new Date().toLocaleDateString('en-IE')}`;

      const result = await exportLeadsToGoogleSheets(accessToken, title, recordsToExport);
      setExportSheetResult(result);
    } catch (err: any) {
      console.error('Failed to export to Google Sheets:', err);
      setExportSheetError(err.message || 'Failed to export to Google Sheets.');
    } finally {
      setIsExportingSheet(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
      {/* Table Header Controls */}
      <div className="p-5 border-b border-slate-100 bg-slate-50/50">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Globe className="w-5 h-5 text-emerald-600" />
              3. Enriched Master Data Table
              <span className="text-xs font-semibold text-slate-500 bg-slate-200/80 px-2.5 py-0.5 rounded-full">
                Showing {filteredRecords.length} of {records.length}
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Real-time results showing verified official website URLs, B2B contact intelligence, and Google Sheets sync.
            </p>
          </div>

          {/* Master Export CTA */}
          <div className="flex flex-wrap items-center gap-2">
            {onOpenColumnMapping && (
              <button
                onClick={onOpenColumnMapping}
                className="inline-flex items-center px-3 py-2 text-xs font-bold text-indigo-900 bg-indigo-100 hover:bg-indigo-200 border border-indigo-300 rounded-lg shadow-2xs transition-all gap-1.5 cursor-pointer"
                title="Relabel columns or re-map CSV fields"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-700" />
                Relabel / Map Columns
              </button>
            )}
            <button
              onClick={handleExportToGoogleSheets}
              disabled={records.length === 0 || isExportingSheet}
              className="inline-flex items-center px-3.5 py-2 text-xs font-bold text-emerald-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg shadow-2xs transition-all gap-1.5 disabled:opacity-50"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-900" />
              {isExportingSheet ? 'Creating Sheet...' : 'Export to Google Sheets'}
            </button>
            <button
              onClick={() => handleDownloadMasterCSV(true)}
              disabled={records.length === 0}
              className="inline-flex items-center px-3.5 py-2 text-xs font-bold text-white bg-slate-800 hover:bg-slate-900 rounded-lg shadow-2xs transition-all gap-1.5 disabled:opacity-50"
            >
              <FileDown className="w-4 h-4" />
              Download Enriched CSV
            </button>
            <button
              onClick={() => handleDownloadMasterCSV(false)}
              disabled={records.length === 0}
              className="inline-flex items-center px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg shadow-2xs transition-all gap-1.5 disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              CSV All
            </button>
          </div>
        </div>

        {/* Google Sheets Success Modal Notification */}
        {exportSheetResult && (
          <div className="mt-3 p-3.5 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center justify-between text-xs text-emerald-900 shadow-xs animate-in fade-in">
            <div className="flex items-center space-x-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <div className="font-bold">Google Sheet Created Successfully!</div>
                <div className="text-emerald-700">"{exportSheetResult.title}" created in your Google Drive.</div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <a
                href={exportSheetResult.spreadsheetUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs transition-colors shadow-2xs"
              >
                Open Google Sheet <ExternalLink className="w-3 h-3 ml-1" />
              </a>
              <button
                onClick={() => setExportSheetResult(null)}
                className="text-emerald-700 hover:text-emerald-950 font-semibold px-2 py-1"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {exportSheetError && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <span>{exportSheetError}</span>
            </div>
            <button onClick={() => setExportSheetError(null)} className="font-semibold text-red-800">Dismiss</button>
          </div>
        )}


        {/* Filters & Search Toolbar */}
        <div className="mt-4 pt-3.5 border-t border-slate-200/80 space-y-3 bg-slate-50/50 -mx-6 px-6 py-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center space-x-2">
              <div className="p-1.5 bg-emerald-100 text-emerald-800 rounded-md">
                <Filter className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Filter Dataset</span>
              <span className="text-[11px] font-semibold text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200">
                Showing {filteredRecords.length} of {records.length}
              </span>
            </div>

            <div className="flex items-center flex-wrap gap-2">
              {/* Show Only Duplicates Toggle */}
              {duplicateAnalysis.hasDuplicates && (
                <button
                  type="button"
                  onClick={() => setShowOnlyDuplicates(!showOnlyDuplicates)}
                  className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer shadow-2xs ${
                    showOnlyDuplicates
                      ? 'bg-amber-600 text-white border-amber-600 ring-2 ring-amber-500/30'
                      : 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                  }`}
                >
                  <AlertCircle className={`w-3.5 h-3.5 mr-1.5 ${showOnlyDuplicates ? 'text-white' : 'text-amber-600'}`} />
                  <span>Duplicates Only</span>
                  <span className={`ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                    showOnlyDuplicates ? 'bg-amber-800 text-amber-100' : 'bg-amber-200 text-amber-900'
                  }`}>
                    {duplicateAnalysis.totalDuplicatesCount}
                  </span>
                </button>
              )}

              {/* Show Only Successful Matches Toggle */}
              <button
                type="button"
                onClick={() => setFilters((prev) => ({ ...prev, showOnlySuccessful: !prev.showOnlySuccessful }))}
                className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer shadow-2xs ${
                  filters.showOnlySuccessful
                    ? 'bg-emerald-600 text-white border-emerald-600 ring-2 ring-emerald-500/30'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-emerald-50/50 hover:border-emerald-300'
                }`}
              >
                <CheckCircle2 className={`w-3.5 h-3.5 mr-1.5 ${filters.showOnlySuccessful ? 'text-white' : 'text-emerald-600'}`} />
                <span>Show Only Successful</span>
                <span className={`ml-2 px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                  filters.showOnlySuccessful ? 'bg-emerald-800 text-emerald-100' : 'bg-slate-100 text-slate-700'
                }`}>
                  {successfulMatchesCount}
                </span>
              </button>

              {/* Reset Filters CTA */}
              {(filters.showOnlySuccessful || showOnlyDuplicates || filters.searchTerm || filters.countyFilter !== 'ALL' || filters.matchTypeFilter !== 'ALL' || filters.statusFilter !== 'ALL' || filters.confidenceFilter !== 'ALL') && (
                <button
                  onClick={() => {
                    setShowOnlyDuplicates(false);
                    setFilters({
                      searchTerm: '',
                      countyFilter: 'ALL',
                      statusFilter: 'ALL',
                      matchTypeFilter: 'ALL',
                      confidenceFilter: 'ALL',
                      showOnlySuccessful: false,
                    });
                  }}
                  className="px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:text-red-600 bg-white hover:bg-red-50 border border-slate-200 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" /> Reset All
                </button>
              )}
            </div>
          </div>

          {/* Filter Dropdowns Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
            {/* Search Box */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search name, CRO..."
                value={filters.searchTerm}
                onChange={(e) => setFilters({ ...filters, searchTerm: e.target.value })}
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-medium"
              />
            </div>

            {/* Pre-Sweep Qualification Triage Filter */}
            <div className="relative">
              <select
                value={qualificationFilter}
                onChange={(e) => setQualificationFilter(e.target.value as any)}
                className={`w-full px-2.5 py-1.5 text-xs border rounded-lg bg-white focus:ring-2 focus:ring-amber-500 focus:border-amber-500 font-bold ${
                  qualificationFilter !== 'ALL' ? 'border-amber-500 text-amber-900 bg-amber-50/50' : 'border-slate-300 text-slate-700'
                }`}
              >
                <option value="ALL">Triage: All Leads</option>
                <option value="QUALIFIED">🟢 Qualified B2B Companies</option>
                <option value="DISQUALIFIED">🔴 Disqualified / Useless</option>
                <option value="NEEDS_REVIEW">🟡 Needs Review</option>
                <option value="UNSCREENED">⚪ Unscreened</option>
              </select>
            </div>

            {/* Status Filter */}
            <div className="relative">
              <select
                value={filters.statusFilter}
                onChange={(e) => setFilters({ ...filters, statusFilter: e.target.value as any })}
                className={`w-full px-2.5 py-1.5 text-xs border rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-semibold ${
                  filters.statusFilter !== 'ALL' ? 'border-emerald-500 text-emerald-900 bg-emerald-50/30' : 'border-slate-300 text-slate-700'
                }`}
              >
                <option value="ALL">Status: All</option>
                <option value="SUCCESS">Success / Enriched</option>
                <option value="FAILED">Failed</option>
                <option value="PENDING">Pending Batch</option>
              </select>
            </div>

            {/* Confidence Score Filter */}
            <div className="relative">
              <select
                value={filters.confidenceFilter}
                onChange={(e) => setFilters({ ...filters, confidenceFilter: e.target.value as any })}
                className={`w-full px-2.5 py-1.5 text-xs border rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-semibold ${
                  filters.confidenceFilter !== 'ALL' ? 'border-emerald-500 text-emerald-900 bg-emerald-50/30' : 'border-slate-300 text-slate-700'
                }`}
              >
                <option value="ALL">Confidence: All</option>
                <option value="HIGH">High Confidence</option>
                <option value="MEDIUM">Medium Confidence</option>
                <option value="LOW">Low Confidence</option>
              </select>
            </div>

            {/* Match Type Filter */}
            <div className="relative">
              <select
                value={filters.matchTypeFilter}
                onChange={(e) => setFilters({ ...filters, matchTypeFilter: e.target.value as any })}
                className={`w-full px-2.5 py-1.5 text-xs border rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-semibold ${
                  filters.matchTypeFilter !== 'ALL' ? 'border-emerald-500 text-emerald-900 bg-emerald-50/30' : 'border-slate-300 text-slate-700'
                }`}
              >
                <option value="ALL">Match Type: All</option>
                <option value="OFFICIAL_WEBSITE">Official Website</option>
                <option value="FACEBOOK_FALLBACK">Facebook Fallback</option>
                <option value="NOT_FOUND">Not Found / Excluded</option>
                <option value="UNPROCESSED">Unprocessed</option>
              </select>
            </div>

            {/* County Filter */}
            <div className="relative">
              <select
                value={filters.countyFilter}
                onChange={(e) => setFilters({ ...filters, countyFilter: e.target.value })}
                className={`w-full px-2.5 py-1.5 text-xs border rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-semibold ${
                  filters.countyFilter !== 'ALL' ? 'border-emerald-500 text-emerald-900 bg-emerald-50/30' : 'border-slate-300 text-slate-700'
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

          {/* Active Filter Chips Bar */}
          {(filters.statusFilter !== 'ALL' || filters.confidenceFilter !== 'ALL' || filters.matchTypeFilter !== 'ALL' || filters.countyFilter !== 'ALL' || filters.searchTerm) && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
              <span className="font-semibold text-slate-400">Active filters:</span>

              {filters.statusFilter !== 'ALL' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold border border-emerald-200">
                  Status: {filters.statusFilter}
                  <button onClick={() => setFilters({ ...filters, statusFilter: 'ALL' })} className="hover:text-emerald-950 cursor-pointer">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {filters.confidenceFilter !== 'ALL' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-semibold border border-blue-200">
                  Confidence: {filters.confidenceFilter}
                  <button onClick={() => setFilters({ ...filters, confidenceFilter: 'ALL' })} className="hover:text-blue-950 cursor-pointer">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {filters.matchTypeFilter !== 'ALL' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 font-semibold border border-purple-200">
                  Match: {filters.matchTypeFilter.replace('_', ' ')}
                  <button onClick={() => setFilters({ ...filters, matchTypeFilter: 'ALL' })} className="hover:text-purple-950 cursor-pointer">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {filters.countyFilter !== 'ALL' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-200 text-slate-800 font-semibold border border-slate-300">
                  County: {filters.countyFilter}
                  <button onClick={() => setFilters({ ...filters, countyFilter: 'ALL' })} className="hover:text-slate-950 cursor-pointer">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {filters.searchTerm && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold border border-amber-200">
                  Search: "{filters.searchTerm}"
                  <button onClick={() => setFilters({ ...filters, searchTerm: '' })} className="hover:text-amber-950 cursor-pointer">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Selected Batch Actions Bar */}
        {selectedIds.size > 0 && (
          <div className="mt-3 p-3 bg-emerald-900 text-white rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs shadow-md animate-in fade-in">
            <div className="flex items-center space-x-3">
              <span className="font-bold bg-emerald-800 px-3 py-1 rounded-lg border border-emerald-700 text-emerald-100 flex items-center gap-1.5">
                <CheckSquare className="w-4 h-4 text-emerald-300" />
                {selectedIds.size} {selectedIds.size === 1 ? 'company' : 'companies'} selected
              </span>
              <button
                type="button"
                onClick={toggleSelectAll}
                className="text-emerald-200 hover:text-white underline font-semibold text-xs cursor-pointer"
              >
                {allFilteredSelected ? 'Deselect All' : `Select All Filtered (${filteredRecords.length})`}
              </button>
            </div>

            <div className="flex items-center flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  onResetRecordStatus(Array.from(selectedIds));
                  setSelectedIds(new Set());
                }}
                className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 border border-emerald-500 rounded-lg text-xs font-bold text-white transition-colors inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
                title="Reset status of selected records to Pending to re-run search"
              >
                <RefreshCw className="w-3.5 h-3.5 text-emerald-200" />
                Reset Status to Pending ({selectedIds.size})
              </button>

              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Are you sure you want to delete ${selectedIds.size} selected companies?`)) {
                    onDeleteRecords(Array.from(selectedIds));
                    setSelectedIds(new Set());
                  }
                }}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
                title="Remove selected records from dataset"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Selected ({selectedIds.size})
              </button>

              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="px-2.5 py-1.5 bg-emerald-800/80 hover:bg-emerald-800 text-emerald-200 hover:text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main Responsive Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-100/80 text-slate-700 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200">
              <th className="py-3 px-3 w-10 text-center">
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="p-1 hover:text-emerald-700 text-slate-400 cursor-pointer"
                  title={allFilteredSelected ? 'Deselect All Filtered Companies' : 'Select All Filtered Companies'}
                >
                  {allFilteredSelected ? (
                    <CheckSquare className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                </button>
              </th>
              <th className="py-3 px-3">Company Name</th>
              <th className="py-3 px-3">CRO / COUNTY</th>
              <th className="py-3 px-3">Address & Eircode</th>
              <th className="py-3 px-3 min-w-[180px]">Digital Footprint</th>
              <th className="py-3 px-3">Contact & DM</th>
              <th className="py-3 px-3">Industry / Size</th>
              <th className="py-3 px-3">PBS Need (Peninsula)</th>
              <th className="py-3 px-3">Data Quality</th>
              <th className="py-3 px-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/80 text-xs">
            {filteredRecords.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-12 text-center text-slate-400 bg-slate-50/50">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <Globe className="w-8 h-8 text-slate-300" />
                    <p className="font-semibold text-slate-600">No company records match your current filter.</p>
                    <p className="text-xs text-slate-400">Import a CSV file or load sample companies to begin enrichment.</p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredRecords.map((record) => {
                const isSelected = selectedIds.has(record.id);
                const isDuplicate = duplicateAnalysis.duplicateRecordIds.has(record.id);

                return (
                  <tr
                    key={record.id}
                    onClick={() => onSelectCompany(record)}
                    className={`hover:bg-slate-50/80 transition-colors cursor-pointer ${
                      record.status === 'PROCESSING' ? 'bg-emerald-50/40 animate-pulse' : ''
                    } ${isSelected ? 'bg-emerald-50/20' : ''} ${
                      isDuplicate ? 'bg-amber-50/30' : ''
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={(e) => toggleSelectRecord(record.id, e)}
                        className="p-1 text-slate-400 hover:text-emerald-600"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </td>

                    {/* Company Name */}
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-900 flex items-center gap-1.5">
                        <span>{record.companyName}</span>
                        {record.status === 'PROCESSING' && (
                          <RefreshCw className="w-3 h-3 text-emerald-600 animate-spin shrink-0" />
                        )}
                      </div>
                      {record.qualificationStatus === 'QUALIFIED' && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.2 mt-0.5 rounded text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          🟢 B2B Qualified
                        </span>
                      )}
                      {record.qualificationStatus === 'DISQUALIFIED' && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.2 mt-0.5 rounded text-[10px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200" title={record.qualificationReason}>
                          🔴 Disqualified ({record.businessType === 'SOLE_TRADER' ? 'Sole Trader' : record.businessType === 'DISSOLVED_INACTIVE' ? 'Defunct' : 'Useless Lead'})
                        </span>
                      )}
                      {record.qualificationStatus === 'NEEDS_REVIEW' && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.2 mt-0.5 rounded text-[10px] font-extrabold bg-amber-50 text-amber-800 border border-amber-200">
                          🟡 Needs Review
                        </span>
                      )}
                    </td>

                    {/* CRO & County */}
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-slate-500 text-[11px]">{record.companyNumber}</span>
                        {isDuplicate && (
                          <span
                            className="inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300"
                            title="Multiple records share this Company / CRO Number"
                          >
                            Duplicate
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5">
                        <span className="font-bold text-slate-900 text-[10px] bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                          {record.county}
                        </span>
                      </div>
                    </td>

                    {/* Address & Eircode */}
                    <td className="py-3 px-3">
                      <div className="text-[10px] text-slate-600 space-y-0.5">
                        {record.rawRowData?.['company_address_1'] && <div className="truncate max-w-[120px]">{record.rawRowData['company_address_1']}</div>}
                        {record.rawRowData?.['company_address_2'] && <div className="truncate max-w-[120px]">{record.rawRowData['company_address_2']}</div>}
                        {record.rawRowData?.['company_address_3'] && <div className="truncate max-w-[120px]">{record.rawRowData['company_address_3']}</div>}
                        {record.rawRowData?.['eircode'] && <div className="font-semibold text-slate-800">{record.rawRowData['eircode']}</div>}
                        {!record.rawRowData?.['company_address_1'] && !record.rawRowData?.['eircode'] && <span className="text-slate-300">&mdash;</span>}
                      </div>
                    </td>

                    {/* Digital Footprint (Website + LinkedIn) */}
                    <td className="py-3 px-3">
                      <div className="space-y-1.5 min-w-[140px] max-w-[200px]">
                        {/* Website */}
                        {record.official_website_url ? (
                          <div className="flex items-center gap-1.5">
                            <a
                              href={record.official_website_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="font-mono text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 hover:underline truncate flex items-center gap-1"
                            >
                              <Globe className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span className="truncate">{record.official_website_url}</span>
                            </a>
                            <button
                              type="button"
                              onClick={(e) => handleCopyUrl(record.official_website_url!, record.id, e)}
                              className="p-0.5 text-slate-400 hover:text-slate-700 rounded transition-colors shrink-0"
                              title="Copy URL"
                            >
                              {copiedId === record.id ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                            </button>
                          </div>
                        ) : record.status === 'SUCCESS' ? (
                          <span className="text-slate-400 italic text-[11px]">No Website</span>
                        ) : record.status === 'PROCESSING' ? (
                          <span className="text-emerald-600 font-medium text-[11px] animate-pulse">Researching...</span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">Pending Step 2</span>
                        )}

                        {/* LinkedIn */}
                        {record.linkedinUrl ? (
                          <div>
                            <a
                              href={record.linkedinUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors border ${
                                record.linkedinType === 'DECISION_MAKER'
                                  ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 hover:text-blue-800'
                                  : 'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100 hover:text-sky-800'
                              }`}
                            >
                              <Linkedin className="w-3 h-3 mr-1 shrink-0 text-blue-600" />
                              <span>{record.linkedinType === 'DECISION_MAKER' ? 'DM Profile' : 'Company Page'}</span>
                              <ExternalLink className="w-2.5 h-2.5 ml-1 opacity-70 shrink-0" />
                            </a>
                          </div>
                        ) : record.status === 'SUCCESS' ? (
                          <span className="inline-flex items-center text-slate-400 text-[10px] italic gap-1">
                            <Linkedin className="w-3 h-3 text-slate-300 shrink-0" /> LinkedIn Not Found
                          </span>
                        ) : null}
                      </div>
                    </td>

                    {/* Contact & DM */}
                    <td className="py-3 px-3">
                      <div className="space-y-1.5 min-w-[150px] max-w-[200px]">
                        {/* DM Info */}
                        {record.decisionMakerName ? (
                          <div className="space-y-0.5">
                            <div className="flex items-center text-slate-900 font-bold text-[11px] gap-1 truncate">
                              <UserCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span className="truncate">{record.decisionMakerName}</span>
                            </div>
                            {record.decisionMakerRole && (
                              <div className="text-[10px] font-semibold text-slate-500 truncate pl-4.5">
                                {record.decisionMakerRole}
                              </div>
                            )}
                          </div>
                        ) : record.status === 'SUCCESS' ? (
                          <span className="text-slate-400 text-[11px] italic block">No DM Listed</span>
                        ) : (
                          <span className="text-slate-300 text-[11px] block">&mdash;</span>
                        )}

                        {/* Contact Channels */}
                        {(record.phoneNumber || record.contactEmail) && (
                          <div className="space-y-0.5 text-[10px] border-t border-slate-100 pt-1 mt-1">
                            {record.phoneNumber && (
                              <div className="flex items-center text-slate-700 font-mono gap-1">
                                <Phone className="w-3 h-3 text-emerald-600 shrink-0" /> {record.phoneNumber}
                              </div>
                            )}
                            {record.contactEmail && (
                              <div className="flex items-center text-slate-600 font-mono gap-1 truncate max-w-[150px]">
                                <Mail className="w-3 h-3 text-blue-600 shrink-0" /> {record.contactEmail}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Industry / Size */}
                    <td className="py-3 px-3">
                      {record.industry ? (
                        <div className="space-y-0.5 max-w-[150px]">
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-800 border border-slate-200 truncate max-w-full">
                            <Building className="w-3 h-3 mr-1 text-slate-500 shrink-0" /> {record.industry}
                          </span>
                          {record.estimatedSize && (
                            <div className="text-[10px] font-medium text-slate-500 pl-1">
                              Size: {record.estimatedSize}
                            </div>
                          )}
                        </div>
                      ) : record.status === 'SUCCESS' ? (
                        <span className="text-slate-400 text-[11px] italic">General B2B</span>
                      ) : (
                        <span className="text-slate-300 text-[11px]">&mdash;</span>
                      )}
                    </td>

                    {/* PBS Need (Peninsula Business Services) */}
                    <td className="py-3 px-3 min-w-[160px]">
                      {record.icpRating !== null && record.icpRating !== undefined ? (
                        <div className="space-y-1 max-w-[200px]">
                          <div className="flex items-center gap-1">
                            <span className={`px-1.5 py-0.2 rounded text-[10px] font-extrabold ${
                              record.icpRating >= 70 ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                              record.icpRating >= 40 ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                              'bg-slate-100 text-slate-700 border border-slate-300'
                            }`}>
                              ICP: {record.icpRating}/100
                            </span>
                          </div>
                          {record.reasonForPbsNeed && (
                            <p className="text-[10px] text-slate-600 line-clamp-2 leading-tight" title={record.reasonForPbsNeed}>
                              {record.reasonForPbsNeed}
                            </p>
                          )}
                        </div>
                      ) : record.status === 'SUCCESS' ? (
                        <span className="text-slate-400 text-[11px] italic">Standard HR/Safety</span>
                      ) : (
                        <span className="text-slate-300 text-[11px]">&mdash;</span>
                      )}
                    </td>



                    {/* Data Quality (Match Type + Confidence) */}
                    <td className="py-3 px-3">
                      <div className="space-y-1">
                        {record.match_type === 'OFFICIAL_WEBSITE' && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <Globe className="w-3 h-3 mr-1 text-emerald-600" /> Web Match
                          </span>
                        )}
                        {record.match_type === 'FACEBOOK_FALLBACK' && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                            <Facebook className="w-3 h-3 mr-1 text-amber-600" /> FB Fallback
                          </span>
                        )}
                        {record.match_type === 'NOT_FOUND' && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                            Excluded
                          </span>
                        )}
                        {record.match_type === 'UNPROCESSED' && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-50 text-slate-400 border border-slate-200/60">
                            Pending
                          </span>
                        )}

                        {record.confidence_score !== 'NONE' && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] font-medium text-slate-400 uppercase tracking-wider">Conf:</span>
                            {record.confidence_score === 'HIGH' && (
                              <span className="px-1.5 py-0.5 text-[9px] font-extrabold text-emerald-700 bg-emerald-100/90 rounded">HIGH</span>
                            )}
                            {record.confidence_score === 'MEDIUM' && (
                              <span className="px-1.5 py-0.5 text-[9px] font-extrabold text-amber-700 bg-amber-100/90 rounded">MED</span>
                            )}
                            {record.confidence_score === 'LOW' && (
                              <span className="px-1.5 py-0.5 text-[9px] font-semibold text-slate-600 bg-slate-100 rounded">LOW</span>
                            )}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end space-x-1">
                        <button
                          type="button"
                          onClick={() => setEditingRecord(record)}
                          className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md transition-colors"
                          title="Relabel / Edit Row Data"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onSelectCompany(record)}
                          className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 rounded-md transition-colors"
                          title="View Details & Notes"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onReEnrichSingle(record)}
                          disabled={isProcessingBatch}
                          className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-md transition-colors disabled:opacity-40"
                          title="Re-verify Single Company"
                        >
                          <Sparkles className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Relabel / Edit Row Modal */}
      <EditRowModal
        isOpen={!!editingRecord}
        record={editingRecord}
        onClose={() => setEditingRecord(null)}
        onSave={(updated) => onEditRecord(updated)}
      />
    </div>
  );
};
