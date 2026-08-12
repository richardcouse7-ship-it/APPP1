import React from 'react';
import { SummaryStats } from '../types';
import { Building2, Globe, Facebook, SearchX, CheckCircle2, TrendingUp } from 'lucide-react';

interface StatsCardsProps {
  stats: SummaryStats;
}

export const StatsCards: React.FC<StatsCardsProps> = ({ stats }) => {
  const completionPercentage = stats.total > 0 ? Math.round((stats.processed / stats.total) * 100) : 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
      {/* Card 1: Total Companies */}
      <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-xs hover:border-slate-300 transition-all">
        <div className="flex items-center justify-between text-slate-500 mb-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Companies</span>
          <Building2 className="w-4 h-4 text-slate-400" />
        </div>
        <div className="text-2xl font-bold text-slate-900">{stats.total}</div>
        <div className="text-xs text-slate-500 mt-0.5">Loaded in target batch</div>
      </div>

      {/* Card 2: Processed Progress */}
      <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-xs hover:border-slate-300 transition-all">
        <div className="flex items-center justify-between text-slate-500 mb-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Processed</span>
          <CheckCircle2 className="w-4 h-4 text-blue-500" />
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-bold text-slate-900">{stats.processed}</span>
          <span className="text-xs font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
            {completionPercentage}%
          </span>
        </div>
        <div className="w-full bg-slate-100 h-1.5 rounded-full mt-1.5 overflow-hidden">
          <div
            className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${completionPercentage}%` }}
          />
        </div>
      </div>

      {/* Card 3: Official Websites Found */}
      <div className="bg-emerald-50/50 rounded-xl border border-emerald-200 p-3.5 shadow-xs hover:border-emerald-300 transition-all">
        <div className="flex items-center justify-between text-emerald-700 mb-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-emerald-800">Official Web</span>
          <Globe className="w-4 h-4 text-emerald-600" />
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-bold text-emerald-950">{stats.officialFound}</span>
          <span className="text-xs font-bold text-emerald-700 bg-emerald-100/80 px-1.5 py-0.5 rounded">
            {stats.processed > 0 ? `${Math.round((stats.officialFound / stats.processed) * 100)}%` : '0%'}
          </span>
        </div>
        <div className="text-xs text-emerald-700 mt-0.5">Verified company domain</div>
      </div>

      {/* Card 4: Facebook Fallbacks */}
      <div className="bg-amber-50/50 rounded-xl border border-amber-200 p-3.5 shadow-xs hover:border-amber-300 transition-all">
        <div className="flex items-center justify-between text-amber-700 mb-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-amber-800">FB Fallbacks</span>
          <Facebook className="w-4 h-4 text-amber-600" />
        </div>
        <div className="text-2xl font-bold text-amber-950">{stats.facebookFallback}</div>
        <div className="text-xs text-amber-700 mt-0.5">Official FB page used</div>
      </div>

      {/* Card 5: Directory Excluded / Not Found */}
      <div className="bg-slate-50/80 rounded-xl border border-slate-200 p-3.5 shadow-xs hover:border-slate-300 transition-all">
        <div className="flex items-center justify-between text-slate-600 mb-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-700">Not Found</span>
          <SearchX className="w-4 h-4 text-slate-400" />
        </div>
        <div className="text-2xl font-bold text-slate-800">{stats.notFound}</div>
        <div className="text-xs text-slate-500 mt-0.5">Directory links filtered out</div>
      </div>

      {/* Card 6: Remaining */}
      <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-xs hover:border-slate-300 transition-all">
        <div className="flex items-center justify-between text-slate-500 mb-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Remaining</span>
          <TrendingUp className="w-4 h-4 text-indigo-500" />
        </div>
        <div className="text-2xl font-bold text-slate-900">{stats.remaining}</div>
        <div className="text-xs text-slate-500 mt-0.5">Ready for batch run</div>
      </div>
    </div>
  );
};
