import React from 'react';
import { Play, Pause, RefreshCw, Sliders, CheckCircle, Shield, Layers, Clock, Zap, Save, Cpu, Database, Sparkles, DollarSign } from 'lucide-react';
import { MODEL_PRICING, formatCost } from '../utils/modelPricing';

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
    { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', speed: 'Ultra Fast', recommended: true },
    { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite', speed: 'Fastest', recommended: false },
    { id: 'perplexity-sonar', label: 'Perplexity Sonar', speed: 'Live Web Search', recommended: false },
    { id: 'perplexity-sonar-pro', label: 'Perplexity Sonar Pro', speed: 'Deep Web Citation', recommended: false },
  ];

  const itemsToProcess = Math.min(batchSize, totalPending);
  const estimatedSeconds = Math.ceil(itemsToProcess * requestDelay);

  const selectedModelRate = MODEL_PRICING[selectedModel];
  const hasPricing = typeof selectedModelRate === 'number';
  const estimatedBatchCost = hasPricing ? itemsToProcess * selectedModelRate : null;
  const estimatedQueueCost = hasPricing ? totalPending * selectedModelRate : null;

  return (
    <div className="bg-char rounded-2xl border border-char-light p-5 mb-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between pb-3 mb-4 border-b border-char-light gap-3">
        <div>
          <h2 className="font-display text-base font-semibold text-ash flex items-center gap-2">
            <Sliders className="w-5 h-5 text-gold" />
            Batch Enrichment & Cost Optimizer Controls
          </h2>
          <p className="text-xs text-smoke font-body mt-0.5">
            Configure batch size, AI model engine, and request delay. Enable Smart Cache to reuse results and eliminate duplicate token spend.
          </p>
        </div>

        {/* Status badges */}
        <div className="flex items-center space-x-2 flex-wrap gap-y-1 font-body">
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-void/60 text-gold border border-gold/30" title="State and settings are auto-saved to localStorage on every change">
            <Save className="w-3.5 h-3.5 mr-1 text-gold" />
            Auto-Save Active
          </span>
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-void/60 text-smoke border border-char-light">
            <Layers className="w-3.5 h-3.5 mr-1 text-smoke" />
            {totalPending} Remaining to Process
          </span>
          {totalProcessed > 0 && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-void/60 text-gold border border-gold/30">
              <CheckCircle className="w-3.5 h-3.5 mr-1 text-gold" />
              {totalProcessed} Already Processed
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: AI Engine Selector & Cache Setting */}
        <div className="lg:col-span-7 space-y-4 font-body">
          {/* Row 1: Model Engine Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-smoke uppercase tracking-wider flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-gold" />
                AI Model Engine:
              </label>

              {/* Cache Toggle */}
              <button
                type="button"
                onClick={() => onToggleCache(!useCache)}
                className={`px-2.5 py-1 rounded-full text-xs font-bold border inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                  useCache
                    ? 'bg-gold/10 border-gold/40 text-gold'
                    : 'bg-void/60 border-char-light text-smoke'
                }`}
                title="When active, previously researched companies load instantly with $0 API token cost"
              >
                <Database className="w-3.5 h-3.5" />
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
                        ? 'bg-gradient-to-br from-ember to-gold text-void border-transparent shadow-lg shadow-ember/20'
                        : 'bg-void/60 text-ash border-char-light hover:border-smoke/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold">{opt.label}</span>
                      {isActive && <Sparkles className="w-3.5 h-3.5" />}
                    </div>
                    <div className={`text-[10px] mt-0.5 ${isActive ? 'text-void/80' : 'text-smoke'}`}>
                      {opt.speed} •{' '}
                      {typeof MODEL_PRICING[opt.id] === 'number'
                        ? `${formatCost(MODEL_PRICING[opt.id])}/record${opt.recommended ? ' (Recommended)' : ''}`
                        : 'Pricing TBD'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Row 2: Batch Size */}
          <div className="pt-2 border-t border-char-light space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="batch-slider" className="text-xs font-bold text-smoke uppercase tracking-wider flex items-center gap-1.5">
                Batch Size:
                <span className="text-xs font-extrabold text-gold bg-gold/10 px-2 py-0.5 rounded-full border border-gold/30 font-mono">
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
                    className={`px-2.5 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                      batchSize === size
                        ? 'bg-ember text-void'
                        : 'bg-void/60 text-smoke hover:text-ash'
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
              className="w-full h-2 bg-void rounded-full appearance-none cursor-pointer accent-ember disabled:opacity-50"
            />
          </div>

          {/* Row 3: Request Delay / Rate Limit Pacing */}
          <div className="pt-2 border-t border-char-light space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-bold text-smoke uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-gold" />
                API Request Pacing / Delay:
                <span className="text-xs font-extrabold text-gold bg-gold/10 px-2 py-0.5 rounded-full border border-gold/30 font-mono">
                  {requestDelay}s
                </span>
              </label>

              {/* Est Batch Time Indicator */}
              {itemsToProcess > 0 && (
                <span className="text-[11px] font-semibold text-smoke bg-void/60 px-2 py-0.5 rounded-full border border-char-light flex items-center gap-1 font-mono">
                  <Zap className="w-3 h-3 text-gold" />
                  Est. Runtime: ~{estimatedSeconds}s ({Math.round(60 / requestDelay)} req/min)
                </span>
              )}

              {/* Est Cost Indicator */}
              {itemsToProcess > 0 && estimatedBatchCost !== null && estimatedQueueCost !== null && (
                <span
                  className="text-[11px] font-semibold text-smoke bg-void/60 px-2 py-0.5 rounded-full border border-char-light flex items-center gap-1 font-mono"
                  title={`Full queue: ${totalPending} records at ${formatCost(selectedModelRate as number)}/record`}
                >
                  <DollarSign className="w-3 h-3 text-gold" />
                  Est. Cost: {formatCost(estimatedBatchCost)} this batch · {formatCost(estimatedQueueCost)} full queue
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
                    className={`px-2 py-1.5 rounded-xl border text-center transition-all cursor-pointer ${
                      isActive
                        ? 'bg-ember text-void border-ember font-bold'
                        : 'bg-void/60 text-ash border-char-light hover:border-smoke/50'
                    }`}
                  >
                    <div className="text-xs font-bold">{preset.label}</div>
                    <div className={`text-[9px] ${isActive ? 'text-void/70' : 'text-smoke'}`}>
                      {preset.tag}
                    </div>
                  </button>
                );
              })}
            </div>

            {useCache && itemsToProcess > 0 && estimatedBatchCost !== null && (
              <div className="text-[10px] text-smoke flex items-center gap-1 pt-1">
                <Shield className="w-3 h-3 text-gold shrink-0" />
                <span>Excludes Smart Cache hits, which are free</span>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Run Batch Button & Dynamic Status */}
        <div className="lg:col-span-5 flex flex-col justify-center space-y-2.5 pt-1 font-body">
          {isRunning ? (
            <div className="space-y-2">
              <button
                type="button"
                onClick={onStopBatch}
                className="w-full inline-flex items-center justify-center px-5 py-3.5 text-sm font-bold text-void bg-gold hover:bg-gold/90 rounded-full transition-all gap-2 cursor-pointer"
              >
                <Pause className="w-4 h-4 fill-current" />
                Stop Batch Processing
              </button>
              {currentActiveRowName && (
                <div className="flex items-center justify-center text-xs text-ash font-medium gap-1.5 bg-void/60 p-2 rounded-xl border border-char-light">
                  <RefreshCw className="w-3.5 h-3.5 text-gold animate-spin shrink-0" />
                  <span>Researching: <strong className="text-ash">{currentActiveRowName}</strong></span>
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={onRunBatch}
              disabled={totalPending === 0 || totalRecords === 0}
              className={`w-full inline-flex items-center justify-center px-6 py-4 text-sm font-bold rounded-full transition-all gap-2 ${
                totalPending === 0 || totalRecords === 0
                  ? 'bg-char-light text-smoke cursor-not-allowed'
                  : 'bg-gradient-to-r from-ember to-gold text-void hover:shadow-lg hover:shadow-ember/30 active:scale-[0.99] cursor-pointer'
              }`}
            >
              <Play className="w-4 h-4 fill-current" />
              {totalPending === 0
                ? 'All Companies Enriched!'
                : `Run Batch Enrichment (${itemsToProcess} ${itemsToProcess === 1 ? 'row' : 'rows'})`}
            </button>
          )}

          {/* Sub-text explanation */}
          <div className="text-[11px] text-smoke text-center flex items-center justify-center gap-1 pt-1">
            <Shield className="w-3 h-3 text-gold shrink-0" />
            <span>Low-thinking configuration prevents quota limits & extra token costs</span>
          </div>
        </div>
      </div>
    </div>
  );
};
