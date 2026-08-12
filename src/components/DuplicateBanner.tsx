import React from 'react';
import { AlertTriangle, Sparkles, Trash2, Eye, CheckCircle2, ShieldAlert, X } from 'lucide-react';
import { DuplicateAnalysisResult } from '../utils/duplicateUtils';

interface DuplicateBannerProps {
  analysis: DuplicateAnalysisResult;
  onAutoClean: () => void;
  onReviewDuplicates: () => void;
  onDismiss: () => void;
}

export const DuplicateBanner: React.FC<DuplicateBannerProps> = ({
  analysis,
  onAutoClean,
  onReviewDuplicates,
  onDismiss,
}) => {
  if (!analysis.hasDuplicates) return null;

  return (
    <div className="bg-amber-50/90 border border-amber-300 rounded-xl p-4 shadow-xs mb-6 transition-all animate-in fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start space-x-3">
          <div className="p-2 bg-amber-100 text-amber-800 rounded-lg shrink-0 mt-0.5">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-sm font-extrabold text-amber-900 flex items-center gap-1.5">
                <span>Automated Upload Check: Potential Duplicates Detected</span>
                <span className="bg-amber-200/80 text-amber-900 text-[10px] uppercase font-black px-2 py-0.5 rounded-full border border-amber-300">
                  {analysis.totalDuplicatesCount} Duplicate(s)
                </span>
              </h3>
            </div>
            <p className="text-xs text-amber-800 mt-1">
              Found <strong className="font-bold">{analysis.totalDuplicatesCount}</strong> redundant company record(s) sharing{' '}
              <strong className="font-bold">{analysis.uniqueCompanyNumbersCount}</strong> Company Number(s) (CRO numbers).
              Cleaning duplicate records ensures API quotas are not wasted during batch enrichment.
            </p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2 shrink-0 self-start md:self-auto">
          <button
            type="button"
            onClick={onAutoClean}
            className="inline-flex items-center px-3.5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 active:bg-amber-800 rounded-lg shadow-2xs transition-all gap-1.5 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Auto-Clean Dataset ({analysis.totalDuplicatesCount})
          </button>

          <button
            type="button"
            onClick={onReviewDuplicates}
            className="inline-flex items-center px-3.5 py-2 text-xs font-bold text-amber-900 bg-white hover:bg-amber-100/80 border border-amber-300 rounded-lg transition-colors gap-1.5 cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5 text-amber-700" />
            Review Duplicates
          </button>

          <button
            type="button"
            onClick={onDismiss}
            title="Dismiss notice"
            className="p-1.5 text-amber-700 hover:text-amber-900 hover:bg-amber-200/60 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
