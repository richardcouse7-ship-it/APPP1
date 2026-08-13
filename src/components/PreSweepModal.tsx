import React, { useState } from 'react';
import { CompanyRecord, QualificationStatus, BusinessType } from '../types';
import { Zap, ShieldCheck, ShieldAlert, AlertTriangle, CheckCircle2, XCircle, Filter, Trash2, ArrowRight, X, Info, Sparkles } from 'lucide-react';

interface PreSweepModalProps {
  isOpen: boolean;
  onClose: () => void;
  records: CompanyRecord[];
  onUpdateRecords: (updatedRecords: CompanyRecord[]) => void;
  onAutoVaultDisqualified: (disqualifiedIds: string[]) => void;
  onStartQualifiedEnrichment: () => void;
  selectedModel: string;
}

export const PreSweepModal: React.FC<PreSweepModalProps> = ({
  isOpen,
  onClose,
  records,
  onUpdateRecords,
  onAutoVaultDisqualified,
  onStartQualifiedEnrichment,
  selectedModel,
}) => {
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [statusText, setStatusText] = useState<string>('Ready to run high-speed initial sweep');
  const [activeTab, setActiveTab] = useState<'ALL' | 'QUALIFIED' | 'DISQUALIFIED' | 'NEEDS_REVIEW'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  if (!isOpen) return null;

  // Unscreened / Total stats
  const totalCount = records.length;
  const screenedRecords = records.filter((r) => r.qualificationStatus && r.qualificationStatus !== 'UNSCREENED');
  const unscreenedRecords = records.filter((r) => !r.qualificationStatus || r.qualificationStatus === 'UNSCREENED');

  const qualifiedList = records.filter((r) => r.qualificationStatus === 'QUALIFIED');
  const disqualifiedList = records.filter((r) => r.qualificationStatus === 'DISQUALIFIED');
  const reviewList = records.filter((r) => r.qualificationStatus === 'NEEDS_REVIEW');

  // Filtered displayed list
  const displayedRecords = records.filter((r) => {
    if (activeTab === 'QUALIFIED' && r.qualificationStatus !== 'QUALIFIED') return false;
    if (activeTab === 'DISQUALIFIED' && r.qualificationStatus !== 'DISQUALIFIED') return false;
    if (activeTab === 'NEEDS_REVIEW' && r.qualificationStatus !== 'NEEDS_REVIEW') return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        r.companyName.toLowerCase().includes(q) ||
        r.county.toLowerCase().includes(q) ||
        (r.qualificationReason && r.qualificationReason.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // Execute High-Speed Pre-Sweep API
  const handleRunSweep = async () => {
    const targetItems = unscreenedRecords.length > 0 ? unscreenedRecords : records;
    if (targetItems.length === 0) return;

    setIsRunning(true);
    setProgress(10);
    setStatusText(`Screening ${targetItems.length} entities with high-speed AI model...`);

    try {
      const response = await fetch('/api/pre-sweep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companies: targetItems.map((r) => ({
            id: r.id,
            companyName: r.companyName,
            county: r.county,
            companyNumber: r.companyNumber,
          })),
          modelName: 'gemini-3.6-flash',
        }),
      });

      setProgress(80);

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const data = await response.json();
      const results: Array<{
        id: string;
        companyName: string;
        qualificationStatus: QualificationStatus;
        businessType: BusinessType;
        qualificationReason: string;
      }> = data.results || [];

      // Create lookup map
      const resultMap = new Map(results.map((item) => [item.id, item]));

      // Merge into state
      const updated = records.map((r) => {
        const res = resultMap.get(r.id);
        if (res) {
          return {
            ...r,
            qualificationStatus: res.qualificationStatus,
            businessType: res.businessType,
            qualificationReason: res.qualificationReason,
          };
        }
        return r;
      });

      onUpdateRecords(updated);
      setProgress(100);
      setStatusText(`High-speed sweep complete! Processed ${results.length} entities in bulk.`);
    } catch (err: any) {
      console.error('Pre-sweep error:', err);
      setStatusText(`Error running pre-sweep: ${err.message || 'API call failed'}`);
    } finally {
      setIsRunning(false);
    }
  };

  // Manual Override toggle
  const handleToggleStatus = (id: string, currentStatus?: QualificationStatus) => {
    const nextStatus: QualificationStatus =
      currentStatus === 'QUALIFIED' ? 'DISQUALIFIED' : 'QUALIFIED';

    const updated = records.map((r) => {
      if (r.id === id) {
        return {
          ...r,
          qualificationStatus: nextStatus,
          qualificationReason:
            nextStatus === 'QUALIFIED'
              ? 'Manually verified by user as valid B2B lead'
              : 'Manually flagged by user as disqualified / useless lead',
        };
      }
      return r;
    });

    onUpdateRecords(updated);
  };

  // Bulk action: Auto-Vault Disqualified
  const handleBulkDiscardUseless = () => {
    const uselessIds = disqualifiedList.map((r) => r.id);
    if (uselessIds.length === 0) return;
    onAutoVaultDisqualified(uselessIds);
  };

  const formatBusinessType = (type?: BusinessType) => {
    switch (type) {
      case 'LIMITED_COMPANY':
        return { label: 'Limited Company', style: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      case 'SOLE_TRADER':
        return { label: 'Sole Trader / Individual', style: 'bg-amber-50 text-amber-800 border-amber-200' };
      case 'DISSOLVED_INACTIVE':
        return { label: 'Dissolved / Ceased', style: 'bg-rose-50 text-rose-700 border-rose-200' };
      case 'NON_B2B':
        return { label: 'Non-B2B / Residential', style: 'bg-slate-100 text-slate-700 border-slate-200' };
      default:
        return { label: 'Unspecified', style: 'bg-slate-50 text-slate-600 border-slate-200' };
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[90vh] my-auto">
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Zap className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Initial Bulk Pre-Sweep Lead Triage
                <span className="text-xs bg-amber-500 text-slate-950 font-extrabold px-2 py-0.5 rounded-full uppercase">
                  High-Speed Filtering
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Swiftly sort through raw datasets to eliminate non-trading entities, sole traders, and non-B2B leads before deep enrichment.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Top Control Bar & Run Trigger */}
        <div className="p-5 bg-slate-50 border-b border-slate-200 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-slate-600">
                Dataset Status: <span className="text-slate-900 font-bold">{totalCount} Total Leads</span> (
                <span className="text-emerald-600 font-bold">{screenedRecords.length} Screened</span>,{' '}
                <span className="text-amber-600 font-bold">{unscreenedRecords.length} Unscreened</span>)
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleRunSweep}
                disabled={isRunning}
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-xs shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Zap className="w-4 h-4 fill-current" />
                {isRunning ? 'Sweeping Dataset...' : unscreenedRecords.length > 0 ? `Run Sweep on ${unscreenedRecords.length} Unscreened Leads` : 'Re-Run Full Pre-Sweep'}
              </button>
            </div>
          </div>

          {/* Progress Bar */}
          {isRunning && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-bold text-slate-700">
                <span>{statusText}</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-amber-500 h-full transition-all duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Summary Stat Badges */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
            <div className="bg-white p-3 rounded-xl border border-slate-200 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs text-slate-500 font-medium">Qualified B2B</div>
                <div className="text-lg font-black text-slate-900">{qualifiedList.length}</div>
              </div>
            </div>

            <div className="bg-white p-3 rounded-xl border border-slate-200 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-rose-50 text-rose-600">
                <XCircle className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs text-slate-500 font-medium">Useless / Disqualified</div>
                <div className="text-lg font-black text-slate-900">{disqualifiedList.length}</div>
              </div>
            </div>

            <div className="bg-white p-3 rounded-xl border border-slate-200 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs text-slate-500 font-medium">Needs Deep Review</div>
                <div className="text-lg font-black text-slate-900">{reviewList.length}</div>
              </div>
            </div>

            <div className="bg-white p-3 rounded-xl border border-slate-200 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-slate-100 text-slate-600">
                <Filter className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs text-slate-500 font-medium">Unscreened</div>
                <div className="text-lg font-black text-slate-900">{unscreenedRecords.length}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Action Banner for Disqualified Items */}
        {disqualifiedList.length > 0 && (
          <div className="bg-rose-50 border-b border-rose-200 p-3.5 px-5 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-rose-900 font-medium">
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
              <span>
                Found <strong className="font-extrabold">{disqualifiedList.length} useless leads</strong> (sole traders, defunct or non-trading entities). Clean them out before starting deep enrichment.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleBulkDiscardUseless}
                className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Move {disqualifiedList.length} Useless Leads to Vault
              </button>
            </div>
          </div>
        )}

        {/* Tabs & Search */}
        <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {(['ALL', 'QUALIFIED', 'DISQUALIFIED', 'NEEDS_REVIEW'] as const).map((tab) => {
              const count =
                tab === 'ALL'
                  ? records.length
                  : tab === 'QUALIFIED'
                  ? qualifiedList.length
                  : tab === 'DISQUALIFIED'
                  ? disqualifiedList.length
                  : reviewList.length;

              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                    activeTab === tab
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {tab === 'ALL' ? 'All Leads' : tab === 'QUALIFIED' ? 'Qualified B2B' : tab === 'DISQUALIFIED' ? 'Disqualified' : 'Needs Review'} ({count})
                </button>
              );
            })}
          </div>

          <input
            type="text"
            placeholder="Search leads..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:border-slate-400 w-full md:w-56"
          />
        </div>

        {/* Triage Results Table */}
        <div className="flex-1 overflow-y-auto p-4">
          {displayedRecords.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs">
              No leads match the current tab filter or search query.
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="p-3">Company Name</th>
                    <th className="p-3">County</th>
                    <th className="p-3">Triage Verdict</th>
                    <th className="p-3">Business Type</th>
                    <th className="p-3">Screening Explanation</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {displayedRecords.map((item) => {
                    const badge = formatBusinessType(item.businessType);
                    const isQual = item.qualificationStatus === 'QUALIFIED';
                    const isDisqual = item.qualificationStatus === 'DISQUALIFIED';

                    return (
                      <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3 font-bold text-slate-900">
                          {item.companyName}
                          {item.companyNumber && (
                            <span className="block text-[10px] text-slate-400 font-normal">
                              CRO #{item.companyNumber}
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-slate-600 font-medium">{item.county}</td>
                        <td className="p-3">
                          {isQual ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              QUALIFIED
                            </span>
                          ) : isDisqual ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200">
                              <XCircle className="w-3.5 h-3.5 text-rose-600" />
                              DISQUALIFIED
                            </span>
                          ) : item.qualificationStatus === 'NEEDS_REVIEW' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-50 text-amber-700 border border-amber-200">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                              NEEDS REVIEW
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                              UNSCREENED
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${badge.style}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="p-3 text-slate-600 max-w-xs truncate" title={item.qualificationReason || 'No reasoning provided'}>
                          {item.qualificationReason || 'Pending initial AI sweep screening.'}
                        </td>
                        <td className="p-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(item.id, item.qualificationStatus)}
                            className="px-2.5 py-1 rounded border border-slate-200 hover:border-slate-300 bg-white text-slate-700 text-[11px] font-bold transition-all cursor-pointer"
                          >
                            {isQual ? 'Flag Disqualified' : 'Mark Qualified'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
            <Info className="w-4 h-4 text-slate-400 shrink-0" />
            <span>
              Pre-sweep uses lightweight AI modeling without live web grounding to save 90%+ API time on bad entries.
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Close Window
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                onStartQualifiedEnrichment();
              }}
              className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs shadow-md transition-all flex items-center gap-2 cursor-pointer"
            >
              Proceed to Full Deep Enrichment ({qualifiedList.length > 0 ? qualifiedList.length : records.length} Qualified)
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
