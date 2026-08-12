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
    <div className="bg-char border border-ember/30 rounded-2xl p-4 mb-6 transition-all animate-in fade-in font-body">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start space-x-3">
          <div className="p-2 bg-ember/10 text-ember rounded-full shrink-0 mt-0.5">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="font-display text-sm font-semibold text-ash flex items-center gap-1.5">
                <span>Automated Upload Check: Potential Duplicates Detected</span>
                <span className="bg-ember/10 text-ember text-[10px] uppercase font-black px-2 py-0.5 rounded-full border border-ember/30">
                  {analysis.totalDuplicatesCount} Duplicate(s)
                </span>
              </h3>
            </div>
            <p className="text-xs text-smoke mt-1">
              Found <strong className="font-bold text-ash">{analysis.totalDuplicatesCount}</strong> redundant company record(s) sharing{' '}
              <strong className="font-bold text-ash">{analysis.uniqueCompanyNumbersCount}</strong> Company Number(s) (CRO numbers).
              Cleaning duplicate records ensures API quotas are not wasted during batch enrichment.
            </p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2 shrink-0 self-start md:self-auto">
          <button
            type="button"
            onClick={onAutoClean}
            className="inline-flex items-center px-3.5 py-2 text-xs font-bold text-void bg-ember hover:bg-ember/90 rounded-full transition-all gap-1.5 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Auto-Clean Dataset ({analysis.totalDuplicatesCount})
          </button>

          <button
            type="button"
            onClick={onReviewDuplicates}
            className="inline-flex items-center px-3.5 py-2 text-xs font-bold text-ash bg-void/60 hover:bg-void border border-char-light rounded-full transition-colors gap-1.5 cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5 text-ember" />
            Review Duplicates
          </button>

          <button
            type="button"
            onClick={onDismiss}
            title="Dismiss notice"
            className="p-1.5 text-smoke hover:text-ash hover:bg-void/60 rounded-full transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
