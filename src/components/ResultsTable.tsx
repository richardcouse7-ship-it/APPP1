import React, { useState, useMemo } from 'react';
import {
  Search, Download, ExternalLink, Globe, Facebook, AlertCircle, Copy, Check,
  Filter, Eye, Edit3, Sparkles, RefreshCw, Trash2, CheckSquare, Square,
  ArrowUpDown, FileDown, ShieldAlert, CheckCircle2, ChevronRight, Phone, Mail, Building, Building2,
  FileSpreadsheet, X, UserCheck, Linkedin, SlidersHorizontal
} from 'lucide-react';
import { CompanyRecord, FilterState, MatchType } from '../types';
import { cleanNullableField } from '../utils/normalize';
import { exportRecordsToCSV, downloadCSV } from '../utils/csvUtils';
import { exportLeadsToGoogleSheets, ExportSheetResult, GoogleAuthExpiredError } from '../services/workspaceService';
import { User } from 'firebase/auth';
import { EditRowModal } from './EditRowModal';
import { useTableFilters } from '../hooks/useTableFilters';
import { ResultsTableToolbar } from './ResultsTableToolbar';

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
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Filter logic — extracted to useTableFilters hook
  const {
    filters, setFilters,
    showOnlyDuplicates, setShowOnlyDuplicates,
    selectedIds, setSelectedIds,
    filteredRecords,
    duplicateAnalysis,
    successfulMatchesCount,
    counties,
    allFilteredSelected,
    toggleSelectAll,
    toggleSelectRecord: hookToggleSelect,
    resetFilters,
    hasActiveFilters,
  } = useTableFilters(records);

  // Wrap toggle to stop event propagation at call site
  const toggleSelectRecord = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    hookToggleSelect(id);
  };

  // Google Sheets export state
  const [isExportingSheet, setIsExportingSheet] = useState(false);
  const [exportSheetResult, setExportSheetResult] = useState<ExportSheetResult | null>(null);
  const [exportSheetError, setExportSheetError] = useState<string | null>(null);

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
      if (err instanceof GoogleAuthExpiredError) {
        onGoogleSignIn();
      }
    } finally {
      setIsExportingSheet(false);
    }
  };

  return (
    <div className="bg-char rounded-2xl border border-char-light overflow-hidden font-body">
      {/* Table Header Controls */}
      <div className="p-5 border-b border-char-light bg-void/40">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-semibold text-ash flex items-center gap-2">
              <Globe className="w-5 h-5 text-gold" />
              3. Enriched Master Data Table
              <span className="text-xs font-semibold text-smoke bg-void/60 px-2.5 py-0.5 rounded-full border border-char-light font-mono">
                Showing {filteredRecords.length} of {records.length}
              </span>
            </h2>
            <p className="text-xs text-smoke mt-0.5">
              Real-time results showing verified official website URLs, B2B contact intelligence, and Google Sheets sync.
            </p>
          </div>

          {/* Master Export CTA */}
          <div className="flex flex-wrap items-center gap-2">
            {onOpenColumnMapping && (
              <button
                onClick={onOpenColumnMapping}
                className="inline-flex items-center px-3 py-2 text-xs font-bold text-ash bg-void/60 hover:bg-void border border-char-light rounded-full transition-all gap-1.5 cursor-pointer"
                title="Relabel columns or re-map CSV fields"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-gold" />
                Relabel / Map Columns
              </button>
            )}
            <button
              onClick={handleExportToGoogleSheets}
              disabled={records.length === 0 || isExportingSheet}
              className="inline-flex items-center px-3.5 py-2 text-xs font-bold text-void bg-gold hover:bg-gold/90 rounded-full transition-all gap-1.5 disabled:opacity-50"
            >
              <FileSpreadsheet className="w-4 h-4" />
              {isExportingSheet ? 'Creating Sheet...' : 'Export to Google Sheets'}
            </button>
            <button
              onClick={() => handleDownloadMasterCSV(true)}
              disabled={records.length === 0}
              className="inline-flex items-center px-3.5 py-2 text-xs font-bold text-void bg-ember hover:bg-ember/90 rounded-full transition-all gap-1.5 disabled:opacity-50"
            >
              <FileDown className="w-4 h-4" />
              Download Enriched CSV
            </button>
            <button
              onClick={() => handleDownloadMasterCSV(false)}
              disabled={records.length === 0}
              className="inline-flex items-center px-3 py-2 text-xs font-semibold text-ash bg-void/60 hover:bg-void border border-char-light rounded-full transition-all gap-1.5 disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5 text-smoke" />
              CSV All
            </button>
          </div>
        </div>

        {/* Google Sheets Success Modal Notification */}
        {exportSheetResult && (
          <div className="mt-3 p-3.5 bg-gold/10 border border-gold/30 rounded-xl flex items-center justify-between text-xs text-ash animate-in fade-in">
            <div className="flex items-center space-x-2.5">
              <CheckCircle2 className="w-5 h-5 text-gold shrink-0" />
              <div>
                <div className="font-bold">Google Sheet Created Successfully!</div>
                <div className="text-smoke">"{exportSheetResult.title}" created in your Google Drive.</div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <a
                href={exportSheetResult.spreadsheetUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center px-3 py-1.5 bg-gold hover:bg-gold/90 text-void font-bold rounded-full text-xs transition-colors"
              >
                Open Google Sheet <ExternalLink className="w-3 h-3 ml-1" />
              </a>
              <button
                onClick={() => setExportSheetResult(null)}
                className="text-smoke hover:text-ash font-semibold px-2 py-1"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {exportSheetError && (
          <div className="mt-3 p-3 bg-ember/10 border border-ember/30 text-ember text-xs rounded-xl flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{exportSheetError}</span>
            </div>
            <button onClick={() => setExportSheetError(null)} className="font-semibold text-ash">Dismiss</button>
          </div>
        )}


        <ResultsTableToolbar
          filters={filters}
          setFilters={setFilters}
          showOnlyDuplicates={showOnlyDuplicates}
          setShowOnlyDuplicates={setShowOnlyDuplicates}
          duplicateAnalysis={duplicateAnalysis}
          successfulMatchesCount={successfulMatchesCount}
          counties={counties}
          totalCount={records.length}
          filteredCount={filteredRecords.length}
          resetFilters={resetFilters}
          hasActiveFilters={hasActiveFilters}
        />

        {/* Selected Batch Actions Bar */}
        {selectedIds.size > 0 && (
          <div className="mt-3 p-3 bg-void text-ash rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs border border-gold/30 animate-in fade-in">
            <div className="flex items-center space-x-3">
              <span className="font-bold bg-char px-3 py-1 rounded-full border border-char-light text-gold flex items-center gap-1.5">
                <CheckSquare className="w-4 h-4" />
                {selectedIds.size} {selectedIds.size === 1 ? 'company' : 'companies'} selected
              </span>
              <button
                type="button"
                onClick={toggleSelectAll}
                className="text-smoke hover:text-ash underline font-semibold text-xs cursor-pointer"
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
                className="px-3 py-1.5 bg-char hover:bg-char-light border border-char-light rounded-full text-xs font-bold text-gold transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                title="Reset status of selected records to Pending to re-run search"
              >
                <RefreshCw className="w-3.5 h-3.5" />
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
                className="px-3 py-1.5 bg-ember hover:bg-ember/90 text-void rounded-full text-xs font-bold transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                title="Remove selected records from dataset"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Selected ({selectedIds.size})
              </button>

              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="px-2.5 py-1.5 bg-char/80 hover:bg-char text-smoke hover:text-ash rounded-full text-xs font-semibold transition-colors cursor-pointer"
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
            <tr className="bg-void/60 text-smoke text-[11px] font-bold uppercase tracking-wider border-b border-char-light">
              <th className="py-3 px-3 w-10 text-center">
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="p-1 hover:text-gold text-smoke cursor-pointer"
                  title={allFilteredSelected ? 'Deselect All Filtered Companies' : 'Select All Filtered Companies'}
                >
                  {allFilteredSelected ? (
                    <CheckSquare className="w-4 h-4 text-gold" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                </button>
              </th>
              <th className="py-3 px-3 w-6"></th>
              <th className="py-3 px-3">Company Name</th>
              <th className="py-3 px-3">CRO / County</th>
              <th className="py-3 px-3 min-w-[200px]">Official Website URL</th>
              <th className="py-3 px-3">Key Decision Maker</th>
              <th className="py-3 px-3">LinkedIn Search</th>
              <th className="py-3 px-3">Industry / Sector</th>
              <th className="py-3 px-3">Verified Contact Info</th>
              <th className="py-3 px-3">Match Type</th>
              <th className="py-3 px-3">Confidence</th>
              <th className="py-3 px-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-char-light text-xs">
            {filteredRecords.length === 0 ? (
              <tr>
                <td colSpan={12} className="py-12 text-center text-smoke bg-void/30">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <Globe className="w-8 h-8 text-char-light" />
                    <p className="font-semibold text-ash">No company records match your current filter.</p>
                    <p className="text-xs text-smoke">Import a CSV file or load sample companies to begin enrichment.</p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredRecords.map((record) => {
                const isSelected = selectedIds.has(record.id);
                const isDuplicate = duplicateAnalysis.duplicateRecordIds.has(record.id);
                const statusDotClass =
                  record.match_type === 'OFFICIAL_WEBSITE'
                    ? 'bg-gold shadow-[0_0_6px_var(--color-gold)]'
                    : record.match_type === 'FACEBOOK_FALLBACK'
                      ? 'bg-ember shadow-[0_0_6px_var(--color-ember)]'
                      : record.status === 'PROCESSING'
                        ? 'bg-gold animate-pulse'
                        : 'bg-smoke';
                const decisionMakerName = cleanNullableField(record.decisionMakerName);
                const contactEmail = cleanNullableField(record.contactEmail);
                const decisionMakerRole = cleanNullableField(record.decisionMakerRole);
                const industry = cleanNullableField(record.industry);
                const phoneNumber = cleanNullableField(record.phoneNumber);

                return (
                  <tr
                    key={record.id}
                    onClick={() => onSelectCompany(record)}
                    className={`hover:bg-void/40 transition-colors cursor-pointer ${
                      record.status === 'PROCESSING' ? 'bg-gold/5 animate-pulse' : ''
                    } ${isSelected ? 'bg-gold/5' : ''} ${
                      isDuplicate ? 'bg-ember/5' : ''
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={(e) => toggleSelectRecord(record.id, e)}
                        className="p-1 text-smoke hover:text-gold"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-gold" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </td>

                    {/* Status Dot */}
                    <td className="py-3 px-3" title={record.match_type}>
                      <span className={`block w-2 h-2 rounded-full ${statusDotClass}`} />
                    </td>

                    {/* Company Name */}
                    <td className="py-3 px-3 font-bold text-ash flex items-center gap-2">
                      <span>{record.companyName}</span>
                      {record.status === 'PROCESSING' && (
                        <RefreshCw className="w-3 h-3 text-gold animate-spin shrink-0" />
                      )}
                    </td>

                    {/* CRO & County */}
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-smoke text-[11px]">{record.companyNumber}</span>
                        {isDuplicate && (
                          <span
                            className="inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-ember/10 text-ember border border-ember/30"
                            title="Multiple records share this Company / CRO Number"
                          >
                            Duplicate
                          </span>
                        )}
                      </div>
                      <div className="font-semibold text-ash text-[11px]">Co. {record.county}</div>
                    </td>

                    {/* Official Website URL */}
                    <td className="py-3 px-3">
                      {record.official_website_url ? (
                        <div className="flex items-center space-x-1.5 max-w-[220px]">
                          <a
                            href={record.official_website_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="font-mono text-xs font-semibold text-gold hover:text-ash hover:underline truncate flex items-center gap-1"
                          >
                            <span className="truncate">{record.official_website_url}</span>
                            <ExternalLink className="w-3 h-3 shrink-0" />
                          </a>
                          <button
                            type="button"
                            onClick={(e) => handleCopyUrl(record.official_website_url!, record.id, e)}
                            className="p-1 text-smoke hover:text-ash rounded transition-colors shrink-0"
                            title="Copy URL"
                          >
                            {copiedId === record.id ? (
                              <Check className="w-3.5 h-3.5 text-gold" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      ) : record.status === 'SUCCESS' ? (
                        <span className="text-smoke italic text-[11px]">No Official Domain</span>
                      ) : record.status === 'PROCESSING' ? (
                        <span className="text-gold font-medium text-[11px] animate-pulse">Researching website...</span>
                      ) : (
                        <span className="text-smoke text-[11px]">Pending Step 2</span>
                      )}
                    </td>

                    {/* Key Decision Maker */}
                    <td className="py-3 px-3">
                      {decisionMakerName ? (
                        <div className="space-y-0.5 max-w-[170px]">
                          <div className="flex items-center text-ash font-bold text-xs gap-1 truncate">
                            <UserCheck className="w-3.5 h-3.5 text-gold shrink-0" />
                            <span className="truncate">{decisionMakerName}</span>
                          </div>
                          {decisionMakerRole && (
                            <div className="text-[10px] font-semibold text-smoke truncate pl-4">
                              {decisionMakerRole}
                            </div>
                          )}
                        </div>
                      ) : record.status === 'SUCCESS' ? (
                        <span className="text-smoke text-[11px] italic">Not listed</span>
                      ) : (
                        <span className="text-char-light text-[11px]">&mdash;</span>
                      )}
                    </td>

                    {/* LinkedIn Search (DM Profile / Business Page / Not Found) */}
                    <td className="py-3 px-3">
                      {record.linkedinUrl ? (
                        <a
                          href={record.linkedinUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center px-2 py-1 rounded-full text-[11px] font-semibold transition-colors border bg-void/60 text-ash border-char-light hover:border-gold/40 hover:text-gold"
                          title={`Click to view ${
                            record.linkedinType === 'DECISION_MAKER' ? 'Decision Maker LinkedIn Profile' : 'Business LinkedIn Page'
                          }`}
                        >
                          <Linkedin className="w-3.5 h-3.5 mr-1 shrink-0" />
                          <span>
                            {record.linkedinType === 'DECISION_MAKER' ? 'DM Profile' : 'Company Page'}
                          </span>
                          <ExternalLink className="w-3 h-3 ml-1 opacity-70 shrink-0" />
                        </a>
                      ) : record.status === 'SUCCESS' ? (
                        <span className="inline-flex items-center text-smoke text-[11px] italic gap-1">
                          <Linkedin className="w-3 h-3 shrink-0" />
                          <span>LinkedIn Not Found</span>
                        </span>
                      ) : (
                        <span className="text-char-light text-[11px]">&mdash;</span>
                      )}
                    </td>

                    {/* Industry / Sector */}
                    <td className="py-3 px-3">
                      {industry ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-void/60 text-ash border border-char-light">
                          <Building className="w-3 h-3 mr-1 text-smoke" /> {industry}
                        </span>
                      ) : record.status === 'SUCCESS' ? (
                        <span className="text-smoke text-[11px] italic">General B2B</span>
                      ) : (
                        <span className="text-char-light text-[11px]">&mdash;</span>
                      )}
                    </td>

                    {/* Verified Contact Info */}
                    <td className="py-3 px-3">
                      {phoneNumber || contactEmail ? (
                        <div className="space-y-0.5 text-[11px]">
                          {phoneNumber && (
                            <div className="flex items-center text-ash font-mono gap-1">
                              <Phone className="w-3 h-3 text-gold shrink-0" /> {phoneNumber}
                            </div>
                          )}
                          {contactEmail && (
                            <div className="flex items-center text-smoke font-mono gap-1 truncate max-w-[150px]">
                              <Mail className="w-3 h-3 text-gold shrink-0" /> {contactEmail}
                            </div>
                          )}
                        </div>
                      ) : record.status === 'SUCCESS' ? (
                        <span className="text-smoke text-[11px] italic">No public contact</span>
                      ) : (
                        <span className="text-char-light text-[11px]">&mdash;</span>
                      )}
                    </td>

                    {/* Match Type Badge */}
                    <td className="py-3 px-3">
                      {record.match_type === 'OFFICIAL_WEBSITE' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-gold/10 text-gold border border-gold/30">
                          <Globe className="w-3 h-3 mr-1" /> Official Web
                        </span>
                      )}
                      {record.match_type === 'FACEBOOK_FALLBACK' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-ember/10 text-ember border border-ember/30">
                          <Facebook className="w-3 h-3 mr-1" /> FB Fallback
                        </span>
                      )}
                      {record.match_type === 'NOT_FOUND' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-void/60 text-smoke border border-char-light">
                          Directory Excluded
                        </span>
                      )}
                      {record.match_type === 'UNPROCESSED' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-void/40 text-char-light border border-char-light/60">
                          Pending
                        </span>
                      )}
                    </td>

                    {/* Confidence Score */}
                    <td className="py-3 px-3">
                      {record.confidence_score === 'HIGH' && (
                        <span className="px-2 py-0.5 text-[10px] font-extrabold text-gold bg-gold/10 rounded-full">
                          HIGH
                        </span>
                      )}
                      {record.confidence_score === 'MEDIUM' && (
                        <span className="px-2 py-0.5 text-[10px] font-extrabold text-ember bg-ember/10 rounded-full">
                          MEDIUM
                        </span>
                      )}
                      {record.confidence_score === 'LOW' && (
                        <span className="px-2 py-0.5 text-[10px] font-semibold text-smoke bg-void/60 rounded-full">
                          LOW
                        </span>
                      )}
                      {record.confidence_score === 'NONE' && (
                        <span className="text-char-light text-[11px]">&mdash;</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end space-x-1">
                        <button
                          type="button"
                          onClick={() => setEditingRecord(record)}
                          className="p-1.5 text-smoke hover:text-gold hover:bg-void/60 rounded-full transition-colors"
                          title="Relabel / Edit Row Data"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onSelectCompany(record)}
                          className="p-1.5 text-smoke hover:text-ash hover:bg-void/60 rounded-full transition-colors"
                          title="View Details & Notes"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onReEnrichSingle(record)}
                          disabled={isProcessingBatch}
                          className="p-1.5 text-smoke hover:text-gold hover:bg-void/60 rounded-full transition-colors disabled:opacity-40"
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
