import React from 'react';
import { Play, Pause, RefreshCw, Sliders, CheckCircle, Shield, Layers, Clock, Zap, Save, Cpu, Database, Sparkles } from 'lucide-react';

interface BatchControlsProps {
  batchSize: number;
  onBatchSizeChange: (size: number) => void;
  requestDelay: number;
  onRequestDelayChange: (delay: number) => void;
  selectedModel: string;
  onModelChange: (model: string) => void;
  useCache: boolean;
  onToggleCache: (enabled: boolean) => void;
  onRunBatch: () => void;
  onStopBatch?: () => void;
  isRunning: boolean;
  totalPending: number;
  totalProcessed: number;
  totalRecords: number;
  currentActiveRowName?: string | null;
  processedInCurrentSession: number;
}

export const BatchControls: React.FC<BatchControlsProps> = ({
  batchSize,
  onBatchSizeChange,
  requestDelay,
  onRequestDelayChange,
  selectedModel,
  onModelChange,
  useCache,
  onToggleCache,
  onRunBatch,
  onStopBatch,
  isRunning,
  totalPending,
  totalProcessed,
  totalRecords,
  currentActiveRowName,
  processedInCurrentSession,
}) => {
  const presetSizes = [5, 10, 25, 50];
  const delayPresets = [
    { label: '0.5s', value: 0.5, tag: 'Fast' },
    { label: '1s', value: 1, tag: 'Standard' },
    { label: '1.2s', value: 1.2, tag: 'Default' },
    { label: '2s', value: 2, tag: 'Conservative' },
    { label: '5s', value: 5, tag: 'Free Quota' },
  ];

  const modelOptions = [
    { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', speed: 'Ultra Fast', cost: 'Low Cost (Recommended)' },
    { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite', speed: 'Fastest', cost: 'Maximum Economy' },
    { id: 'perplexity-sonar', label: 'Perplexity Sonar', speed: 'Live Web Search', cost: 'Perplexity Search' },
    { id: 'perplexity-sonar-pro', label: 'Perplexity Sonar Pro', speed: 'Deep Web Citation', cost: 'Advanced Perplexity' },
  ];

  const itemsToProcess = Math.min(batchSize, totalPending);
  const estimatedSeconds = Math.ceil(itemsToProcess * requestDelay);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs mb-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between pb-3 mb-4 border-b border-slate-100 gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Sliders className="w-5 h-5 text-emerald-600" />
            Batch Enrichment & Cost Optimizer Controls
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure batch size, AI model engine, and request delay. Enable Smart Cache to reuse results and eliminate duplicate token spend.
          </p>
        </div>

        {/* Status badges */}
        <div className="flex items-center space-x-2 flex-wrap gap-y-1">
          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200" title="State and settings are auto-saved to localStorage on every change">
            <Save className="w-3.5 h-3.5 mr-1 text-emerald-600" />
            Auto-Save Active
          </span>
          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            <Layers className="w-3.5 h-3.5 mr-1 text-slate-500" />
            {totalPending} Remaining to Process
          </span>
          {totalProcessed > 0 && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
              <CheckCircle className="w-3.5 h-3.5 mr-1 text-emerald-600" />
              {totalProcessed} Already Processed
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: AI Engine Selector & Cache Setting */}
        <div className="lg:col-span-7 space-y-4">
          {/* Row 1: Model Engine Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-emerald-600" />
                AI Model Engine:
              </label>

              {/* Cache Toggle */}
              <button
                type="button"
                onClick={() => onToggleCache(!useCache)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold border inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                  useCache
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                    : 'bg-slate-50 border-slate-200 text-slate-500'
                }`}
                title="When active, previously researched companies load instantly with $0 API token cost"
              >
                <Database className="w-3.5 h-3.5 text-emerald-600" />
                Smart Cache: {useCache ? 'ON (0 Token Reuse)' : 'OFF (Force Refetch)'}
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {modelOptions.map((opt) => {
                const isActive = selectedModel === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onModelChange(opt.id)}
                    disabled={isRunning}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      isActive
                        ? 'bg-emerald-900 text-white border-emerald-900 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold">{opt.label}</span>
                      {isActive && <Sparkles className="w-3.5 h-3.5 text-amber-400" />}
                    </div>
                    <div className={`text-[10px] mt-0.5 ${isActive ? 'text-emerald-200' : 'text-slate-500'}`}>
                      {opt.speed} • {opt.cost}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Row 2: Batch Size */}
          <div className="pt-2 border-t border-slate-100 space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="batch-slider" className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                Batch Size:
                <span className="text-xs font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  {batchSize} rows
                </span>
              </label>

              {/* Quick preset buttons */}
              <div className="flex items-center space-x-1.5">
                {presetSizes.map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => onBatchSizeChange(size)}
                    disabled={isRunning}
                    className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                      batchSize === size
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            {/* Slider input */}
            <input
              id="batch-slider"
              type="range"
              min="1"
              max="50"
              value={batchSize}
              onChange={(e) => onBatchSizeChange(parseInt(e.target.value, 10))}
              disabled={isRunning || totalPending === 0}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600 disabled:opacity-50"
            />
          </div>

          {/* Row 3: Request Delay / Rate Limit Pacing */}
          <div className="pt-2 border-t border-slate-100 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-emerald-600" />
                API Request Pacing / Delay:
                <span className="text-xs font-extrabold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  {requestDelay}s
                </span>
              </label>

              {/* Est Batch Time Indicator */}
              {itemsToProcess > 0 && (
                <span className="text-[11px] font-semibold text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-200 flex items-center gap-1">
                  <Zap className="w-3 h-3 text-amber-500" />
                  Est. Runtime: ~{estimatedSeconds}s ({Math.round(60 / requestDelay)} req/min)
                </span>
              )}
            </div>

            {/* Delay presets toggle pills */}
            <div className="grid grid-cols-5 gap-1.5">
              {delayPresets.map((preset) => {
                const isActive = requestDelay === preset.value;
                return (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => onRequestDelayChange(preset.value)}
                    disabled={isRunning}
                    className={`px-2 py-1.5 rounded-lg border text-center transition-all cursor-pointer ${
                      isActive
                        ? 'bg-emerald-600 text-white border-emerald-600 font-bold shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="text-xs font-bold">{preset.label}</div>
                    <div className={`text-[9px] ${isActive ? 'text-emerald-100' : 'text-slate-400'}`}>
                      {preset.tag}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Run Batch Button & Dynamic Status */}
        <div className="lg:col-span-5 flex flex-col justify-center space-y-2.5 pt-1">
          {isRunning ? (
            <div className="space-y-2">
              <button
                type="button"
                onClick={onStopBatch}
                className="w-full inline-flex items-center justify-center px-5 py-3.5 text-sm font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-md transition-all gap-2 cursor-pointer"
              >
                <Pause className="w-4 h-4 fill-current" />
                Stop Batch Processing
              </button>
              {currentActiveRowName && (
                <div className="flex items-center justify-center text-xs text-slate-600 font-medium animate-pulse gap-1.5 bg-emerald-50/70 p-2 rounded-lg border border-emerald-200/60">
                  <RefreshCw className="w-3.5 h-3.5 text-emerald-600 animate-spin shrink-0" />
                  <span>Researching: <strong className="text-slate-800">{currentActiveRowName}</strong></span>
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={onRunBatch}
              disabled={totalPending === 0 || totalRecords === 0}
              className={`w-full inline-flex items-center justify-center px-6 py-4 text-sm font-bold text-white rounded-xl shadow-md transition-all gap-2 ${
                totalPending === 0 || totalRecords === 0
                  ? 'bg-slate-300 cursor-not-allowed shadow-none'
                  : 'bg-emerald-600 hover:bg-emerald-700 hover:shadow-lg hover:shadow-emerald-900/20 active:scale-[0.99] cursor-pointer'
              }`}
            >
              <Play className="w-4 h-4 fill-current text-white" />
              {totalPending === 0
                ? 'All Companies Enriched!'
                : `Run Batch Enrichment (${itemsToProcess} ${itemsToProcess === 1 ? 'row' : 'rows'})`}
            </button>
          )}

          {/* Sub-text explanation */}
          <div className="text-[11px] text-slate-500 text-center flex items-center justify-center gap-1 pt-1">
            <Shield className="w-3 h-3 text-emerald-600 shrink-0" />
            <span>Low-thinking configuration prevents quota limits & extra token costs</span>
          </div>
        </div>
      </div>
    </div>
  );
};

