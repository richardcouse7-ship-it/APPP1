import React, { useState } from 'react';
import { CompanyRecord } from '../types';
import { Zap, CheckCircle2, XCircle, ArrowRight, X, Info, Sparkles, Globe } from 'lucide-react';

interface WebsiteSweepModalProps {
  isOpen: boolean;
  onClose: () => void;
  records: CompanyRecord[];
  onUpdateRecords: (updatedRecords: CompanyRecord[]) => void;
  onStartQualifiedEnrichment: () => void;
  selectedModel: string;
}

export const WebsiteSweepModal: React.FC<WebsiteSweepModalProps> = ({
  isOpen,
  onClose,
  records,
  onUpdateRecords,
  onStartQualifiedEnrichment,
  selectedModel,
}) => {
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [statusText, setStatusText] = useState<string>('Ready to run fast website URL sweep');
  const [activeTab, setActiveTab] = useState<'ALL' | 'HAS_WEBSITE' | 'NO_WEBSITE' | 'UNSCREENED'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  if (!isOpen) return null;

  const totalCount = records.length;
  const screenedRecords = records.filter((r) => r.sweepStatus && r.sweepStatus !== 'UNSCREENED');
  const unscreenedRecords = records.filter((r) => !r.sweepStatus || r.sweepStatus === 'UNSCREENED');
  const hasWebsiteList = records.filter((r) => r.sweepStatus === 'SWEPT_FOUND' || r.official_website_url);
  const noWebsiteList = records.filter((r) => r.sweepStatus === 'SWEPT_NOT_FOUND' && !r.official_website_url);

  const displayedRecords = records.filter((r) => {
    const hasWebsite = r.sweepStatus === 'SWEPT_FOUND' || r.official_website_url;
    const noWebsite = r.sweepStatus === 'SWEPT_NOT_FOUND' && !r.official_website_url;
    const unscreened = !r.sweepStatus || r.sweepStatus === 'UNSCREENED';

    if (activeTab === 'HAS_WEBSITE' && !hasWebsite) return false;
    if (activeTab === 'NO_WEBSITE' && !noWebsite) return false;
    if (activeTab === 'UNSCREENED' && !unscreened) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        r.companyName.toLowerCase().includes(q) ||
        (r.county && r.county.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const handleRunSweep = async () => {
    if (unscreenedRecords.length === 0) {
      alert("No unscreened leads left to sweep!");
      return;
    }
    setIsRunning(true);
    setProgress(0);
    setStatusText(`Preparing to sweep ${unscreenedRecords.length} companies...`);

    const batchSize = 100;
    const batches = [];
    for (let i = 0; i < unscreenedRecords.length; i += batchSize) {
      batches.push(unscreenedRecords.slice(i, i + batchSize));
    }

    const updatedRecords = [...records];
    let processedCount = 0;

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      setStatusText(`Sweeping batch ${i + 1} of ${batches.length} (${batch.length} companies)...`);
      
      try {
        const response = await fetch('/api/pre-sweep', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companies: batch,
            modelName: selectedModel,
          }),
        });
        
        if (!response.ok) throw new Error('API Request Failed');
        const data = await response.json();
        
        const results = data.results || [];
        results.forEach((res: any) => {
          const recIndex = updatedRecords.findIndex((r) => r.id === res.id);
          if (recIndex !== -1) {
            updatedRecords[recIndex] = {
              ...updatedRecords[recIndex],
              official_website_url: res.websiteUrl || null,
              sweepStatus: res.websiteUrl ? 'SWEPT_FOUND' : 'SWEPT_NOT_FOUND',
            };
          }
        });

      } catch (err) {
        console.error("Batch sweep error", err);
      }
      
      processedCount += batch.length;
      setProgress((processedCount / unscreenedRecords.length) * 100);
      onUpdateRecords([...updatedRecords]);
    }
    
    setStatusText(`Completed cheap sweep of ${unscreenedRecords.length} companies!`);
    setIsRunning(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm font-sans">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
        
        <div className="bg-slate-900 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 rounded-xl border border-indigo-500/30">
              <Globe className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Cheap Sweep (Find Websites)
                <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-[10px] font-extrabold uppercase tracking-wider">
                  Step 1
                </span>
              </h2>
              <p className="text-slate-400 text-xs mt-0.5 font-medium">
                Rapidly identify website URLs for a large list before performing deep enrichment.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 bg-indigo-50/50 border-b border-indigo-100 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex-1 w-full">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700 mb-2">
              <span>Sweep Progress</span>
              <span className="text-indigo-700">{Math.round(progress)}% ({screenedRecords.length} / {totalCount})</span>
            </div>
            <div className="h-3 w-full bg-slate-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-indigo-600 rounded-full transition-all duration-300 ease-out flex items-center justify-end"
                style={{ width: `${progress}%` }}
              >
                {progress > 5 && <div className="w-2 h-2 rounded-full bg-white/40 mr-1 animate-pulse" />}
              </div>
            </div>
            <div className="mt-2 text-xs font-medium text-slate-500 flex items-center gap-2">
              {isRunning ? <Sparkles className="w-3.5 h-3.5 text-indigo-500 animate-spin" /> : <Info className="w-3.5 h-3.5" />}
              {statusText}
            </div>
          </div>

          <div className="flex-shrink-0 flex gap-3 w-full md:w-auto">
            <button
              onClick={handleRunSweep}
              disabled={isRunning || unscreenedRecords.length === 0}
              className="flex-1 md:flex-none px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-extrabold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Zap className="w-4 h-4" />
              {isRunning ? 'Sweeping URLs...' : `Run Sweep (${unscreenedRecords.length} Unscreened)`}
            </button>
          </div>
        </div>

        <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {(['ALL', 'HAS_WEBSITE', 'NO_WEBSITE', 'UNSCREENED'] as const).map((tab) => {
              const count =
                tab === 'ALL'
                  ? records.length
                  : tab === 'HAS_WEBSITE'
                  ? hasWebsiteList.length
                  : tab === 'NO_WEBSITE'
                  ? noWebsiteList.length
                  : unscreenedRecords.length;
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
                  {tab === 'ALL' ? 'All Leads' : tab === 'HAS_WEBSITE' ? 'Has Website' : tab === 'NO_WEBSITE' ? 'No Website' : 'Unscreened'} ({count})
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
                    <th className="p-3">Sweep Result</th>
                    <th className="p-3">Website URL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {displayedRecords.map((item) => {
                    const hasWeb = item.sweepStatus === 'SWEPT_FOUND' || item.official_website_url;
                    const noWeb = item.sweepStatus === 'SWEPT_NOT_FOUND' && !item.official_website_url;
                    return (
                      <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3 font-bold text-slate-900">
                          {item.companyName}
                        </td>
                        <td className="p-3 text-slate-600 font-medium">{item.county}</td>
                        <td className="p-3">
                          {hasWeb ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              FOUND
                            </span>
                          ) : noWeb ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200">
                              <XCircle className="w-3.5 h-3.5 text-rose-600" />
                              NOT FOUND
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                              UNSCREENED
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-indigo-600 max-w-xs truncate" title={item.official_website_url || ''}>
                          {item.official_website_url ? (
                            <a href={item.official_website_url} target="_blank" rel="noopener noreferrer" className="hover:underline flex items-center gap-1">
                              {item.official_website_url}
                            </a>
                          ) : (
                            <span className="text-slate-400 italic">None</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
            <Info className="w-4 h-4 text-slate-400 shrink-0" />
            <span>
              Use the cheap sweep to find websites quickly before running the full expensive deep enrichment.
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
              Proceed to Deep Enrichment (Step 2)
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
