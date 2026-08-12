import React from 'react';
import { SummaryStats } from '../types';
import { Building2, Globe, Facebook, SearchX, TrendingUp } from 'lucide-react';

interface StatsCardsProps {
  stats: SummaryStats;
}

const GAUGE_RADIUS = 68;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;

const ReadoutTile: React.FC<{
  label: string;
  value: number;
  sub: string;
  icon: React.ReactNode;
  tone: 'ash' | 'gold' | 'ember' | 'smoke';
}> = ({ label, value, sub, icon, tone }) => {
  const toneClass = {
    ash: 'text-ash group-hover:text-white',
    gold: 'text-gold group-hover:text-amber-300',
    ember: 'text-ember group-hover:text-orange-400',
    smoke: 'text-smoke group-hover:text-ash',
  }[tone];

  const borderHoverClass = {
    ash: 'hover:border-ash/40 hover:shadow-ash/5',
    gold: 'hover:border-gold/40 hover:shadow-gold/5',
    ember: 'hover:border-ember/40 hover:shadow-ember/5',
    smoke: 'hover:border-smoke/40 hover:shadow-smoke/5',
  }[tone];

  return (
    <div className={`group bg-void/70 backdrop-blur-sm rounded-xl border border-char-light/80 px-4 py-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${borderHoverClass}`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-smoke/90 font-body group-hover:text-ash/80 transition-colors">{label}</span>
        <span className={`${toneClass} transition-transform duration-200 group-hover:scale-110`}>{icon}</span>
      </div>
      <div className={`font-mono text-2xl font-bold tracking-tight ${toneClass} transition-colors`}>{value}</div>
      <div className="text-[11px] text-smoke/80 font-body mt-1 group-hover:text-smoke transition-colors">{sub}</div>
    </div>
  );
};

export const StatsCards: React.FC<StatsCardsProps> = ({ stats }) => {
  const completionPercentage = stats.total > 0 ? Math.round((stats.processed / stats.total) * 100) : 0;
  const officialPct = stats.processed > 0 ? Math.round((stats.officialFound / stats.processed) * 100) : 0;
  const dashOffset = GAUGE_CIRCUMFERENCE * (1 - completionPercentage / 100);

  return (
    <div className="bg-char/90 backdrop-blur-md rounded-2xl border border-char-light/90 p-5 sm:p-6 mb-6 shadow-xl relative overflow-hidden group">
      {/* Background glow accent */}
      <div className="absolute -top-24 -left-24 w-64 h-64 bg-ember/5 rounded-full blur-3xl pointer-events-none group-hover:bg-ember/10 transition-all duration-700" />
      <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-gold/5 rounded-full blur-3xl pointer-events-none group-hover:bg-gold/10 transition-all duration-700" />

      <div className="relative flex flex-col lg:flex-row items-center gap-6">
        {/* Primary dial: Processed % */}
        <div className="relative shrink-0 w-44 h-44 flex items-center justify-center">
          <svg viewBox="0 0 160 160" className="w-44 h-44 -rotate-90 drop-shadow-md">
            <defs>
              <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="var(--color-ember)" />
                <stop offset="100%" stopColor="var(--color-gold)" />
              </linearGradient>
            </defs>
            <circle cx="80" cy="80" r={GAUGE_RADIUS} fill="none" stroke="var(--color-char-light)" strokeWidth="10" />
            <circle
              cx="80"
              cy="80"
              r={GAUGE_RADIUS}
              fill="none"
              stroke="url(#gaugeGradient)"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={GAUGE_CIRCUMFERENCE}
              strokeDashoffset={dashOffset}
              className="transition-all duration-700 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display text-4xl font-bold tracking-tight text-ash drop-shadow">{completionPercentage}%</span>
            <span className="text-[10px] uppercase font-semibold tracking-wider text-smoke font-body mt-0.5">Processed</span>
            <span className="font-mono text-xs font-medium text-gold mt-1 bg-void/60 px-2 py-0.5 rounded-full border border-gold/20">
              {stats.processed} / {stats.total}
            </span>
          </div>
        </div>

        {/* Secondary readout cluster */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full">
          <ReadoutTile
            label="Total Companies"
            value={stats.total}
            sub="Loaded in batch"
            icon={<Building2 className="w-4 h-4" />}
            tone="ash"
          />
          <ReadoutTile
            label="Official Web"
            value={stats.officialFound}
            sub={`${officialPct}% of processed`}
            icon={<Globe className="w-4 h-4" />}
            tone="gold"
          />
          <ReadoutTile
            label="FB Fallbacks"
            value={stats.facebookFallback}
            sub="Official FB page used"
            icon={<Facebook className="w-4 h-4" />}
            tone="ember"
          />
          <ReadoutTile
            label="Not Found"
            value={stats.notFound}
            sub="Filtered directory links"
            icon={<SearchX className="w-4 h-4" />}
            tone="smoke"
          />
          <ReadoutTile
            label="Remaining"
            value={stats.remaining}
            sub="Ready for batch run"
            icon={<TrendingUp className="w-4 h-4" />}
            tone="ash"
          />
        </div>
      </div>
    </div>
  );
};
