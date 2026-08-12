import React, { useState } from 'react';
import { Sparkles, X, Loader2, Award, Target, FileText, CheckCircle2, ChevronRight, RefreshCw } from 'lucide-react';
import { CompanyRecord } from '../types';
import { apiFetch } from '../lib/apiClient';

interface AiIntelligenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  records: CompanyRecord[];
}

export const AiIntelligenceModal: React.FC<AiIntelligenceModalProps> = ({
  isOpen,
  onClose,
  records,
}) => {
  const [report, setReport] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleGenerateReport = async () => {
    if (records.length === 0 || isLoading) return;
    setIsLoading(true);

    try {
      const res = await apiFetch('/api/ai-analyze-dataset', {
        method: 'POST',
        body: JSON.stringify({
          records,
          prompt: customPrompt || 'Provide lead scoring, top high-priority targets, county density breakdown, and cold outreach recommendations.',
        }),
      });

      if (!res.ok) throw new Error('Failed to analyze dataset');
      const data = await res.json();
      setReport(data.analysis || 'Analysis complete.');
    } catch (err: any) {
      setReport(`Analysis Error: ${err.message || 'Server error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-indigo-800 via-indigo-900 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 rounded-xl backdrop-blur-md border border-indigo-400/30">
              <Sparkles className="w-5 h-5 text-indigo-300" />
            </div>
            <div>
              <h3 className="font-semibold text-lg text-white">Gemini B2B Lead Intelligence</h3>
              <p className="text-xs text-indigo-200">Dataset Analysis, Prospect Scoring & Strategy</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 rounded-lg text-white/80 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 bg-slate-50/50">
          <div className="bg-indigo-50/80 border border-indigo-200 rounded-xl p-4 flex items-start gap-3">
            <Target className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
            <div className="text-xs text-indigo-950 space-y-1">
              <p className="font-semibold text-sm text-indigo-900">
                Analyzing {records.length} Irish Lead Records
              </p>
              <p>
                Gemini will score verified business domains, rank top executive targets, analyze county distribution, and generate customized outreach templates.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-700">
              Custom Research Query / Focus (Optional):
            </label>
            <input
              type="text"
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="e.g. Focus on Tech & Manufacturing companies in Cork or Dublin with verified emails..."
              className="w-full px-4 py-2.5 text-sm bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleGenerateReport}
              disabled={isLoading || records.length === 0}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm rounded-xl shadow-sm transition-all disabled:opacity-50 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating Intelligence...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  {report ? 'Re-Run Intelligence Report' : 'Generate Intelligence Report'}
                </>
              )}
            </button>
          </div>

          {report && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-3">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3 text-slate-800 font-semibold text-sm">
                <FileText className="w-4 h-4 text-indigo-600" />
                AI B2B Lead Strategy & Quality Audit
              </div>
              <div className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap font-sans">
                {report}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
