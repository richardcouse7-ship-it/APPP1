import React, { useState } from 'react';
import { Database, Sparkles, Trash2, ArrowRight, Upload, Search, CheckSquare, Square, RefreshCw, FileSpreadsheet } from 'lucide-react';
import { CompanyRecord } from '../types';

interface StagedLeadsVaultProps {
  stagedLeads: CompanyRecord[];
  onPromoteAndEnrich: (leadsToPromote: CompanyRecord[]) => void;
  onDeleteStagedLeads: (idsToDelete: string[]) => void;
  onClearStagingVault: () => void;
  onResetDisqualifiedStagedLeads?: () => void;
  onRunLightSweep: () => void;
  onStopLightSweep: () => void;
  isRunningSweep: boolean;
  currentActiveRowName?: string | null;
}

export const StagedLeadsVault: React.FC<StagedLeadsVaultProps> = ({
  stagedLeads,
  onPromoteAndEnrich,
  onDeleteStagedLeads,
  onClearStagingVault,
  onResetDisqualifiedStagedLeads,
  onRunLightSweep,
  onStopLightSweep,
  isRunningSweep,
  currentActiveRowName,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [countyFilter, setCountyFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'DISQUALIFIED'>('ALL');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const counties = Array.from(new Set(stagedLeads.map((l) => l.county).filter(Boolean))).sort();
  const pendingCount = stagedLeads.filter((l) => l.match_type !== 'DISQUALIFIED').length;
  const disqualifiedCount = stagedLeads.filter((l) => l.match_type === 'DISQUALIFIED').length;

  const filteredStagedLeads = stagedLeads.filter((lead) => {
    const matchesSearch =
      !searchTerm ||
      lead.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.companyNumber.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCounty = countyFilter === 'ALL' || lead.county.toLowerCase() === countyFilter.toLowerCase();

    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'DISQUALIFIED' && lead.match_type === 'DISQUALIFIED') ||
      (statusFilter === 'PENDING' && lead.match_type !== 'DISQUALIFIED');

    return matchesSearch && matchesCounty && matchesStatus;
  });

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredStagedLeads.length && filteredStagedLeads.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredStagedLeads.map((l) => l.id)));
    }
  };

  const handlePromoteSelected = () => {
    const toPromote = stagedLeads.filter((l) => selectedIds.size === 0 || selectedIds.has(l.id));
    onPromoteAndEnrich(toPromote);
    setSelectedIds(new Set());
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    if (window.confirm(`Are you sure you want to delete ${selectedIds.size} staged leads from the vault?`)) {
      onDeleteStagedLeads(Array.from(selectedIds));
      setSelectedIds(new Set());
    }
  };

  if (stagedLeads.length === 0) {
    return (
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-amber-500/20 rounded-xl text-amber-400 border border-amber-500/30">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">Tier 1: Staged Raw Leads Vault (Mini Database)</h3>
              <p className="text-xs text-slate-400">
                Uploaded files enter this raw staging vault before batch enrichment.
              </p>
            </div>
          </div>
          <span className="text-xs px-2.5 py-1 bg-slate-800 text-slate-400 font-semibold rounded-full border border-slate-700">
            0 Staged Leads
          </span>
        </div>
        <p className="text-xs text-slate-400 mt-4 italic text-center">
          No raw leads currently staged in vault. Import a CSV/XLSX file above or load sample data to populate the staging mini-database.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl overflow-hidden transition-all">
      {/* Header */}
      <div className="p-5 bg-gradient-to-r from-amber-900 via-amber-950 to-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-500/20 border border-amber-400/30 rounded-xl text-amber-300">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-base text-white flex items-center gap-2">
              Tier 1: Staged Raw Leads Vault
              <span className="text-xs px-2.5 py-0.5 bg-amber-500/30 text-amber-200 border border-amber-400/30 rounded-full">
                {stagedLeads.length} Raw Leads Staged
              </span>
            </h3>
            <p className="text-xs text-amber-200/90">
              Raw leads from your uploaded CSV/XLSX file are held here. Run Light Sweep for fast bulk match, or click "Enrich & Bring Through".
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {isRunningSweep ? (
            <button
              type="button"
              onClick={onStopLightSweep}
              className="px-4 py-2 bg-amber-500 text-slate-950 font-bold text-xs rounded-xl transition-all inline-flex items-center gap-1.5 cursor-pointer hover:bg-amber-400"
            >
              Stop Light Sweep
            </button>
          ) : (
            <button
              type="button"
              onClick={onRunLightSweep}
              disabled={pendingCount === 0}
              title="Fast Perplexity pass: verifies trading status and website, auto-promotes trading matches to Tier 2"
              className={`px-4 py-2 font-bold text-xs rounded-xl transition-all inline-flex items-center gap-1.5 ${
                pendingCount === 0
                  ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950 cursor-pointer shadow-sm'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              Run Light Sweep ({Math.min(pendingCount, 50)} of {pendingCount})
            </button>
          )}
          <button
            type="button"
            onClick={handlePromoteSelected}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-sm transition-all inline-flex items-center gap-1.5 cursor-pointer"
            title="Skip Light Sweep and send hand-picked leads straight to full enrichment"
          >
            <Sparkles className="w-4 h-4 text-emerald-200" />
            Enrich & Bring Through {selectedIds.size > 0 ? `(${selectedIds.size})` : 'All'} to Final Table
            <ArrowRight className="w-4 h-4" />
          </button>
          {disqualifiedCount > 0 && onResetDisqualifiedStagedLeads && (
            <button
              type="button"
              onClick={onResetDisqualifiedStagedLeads}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 hover:text-amber-200 font-medium text-xs rounded-xl border border-slate-700 transition-colors cursor-pointer inline-flex items-center gap-1"
              title="Reset all disqualified leads back to Pending so they can be re-swept or promoted"
            >
              <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
              Re-queue Disqualified ({disqualifiedCount})
            </button>
          )}
          <button
            type="button"
            onClick={onClearStagingVault}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-amber-200 hover:text-white font-medium text-xs rounded-xl border border-slate-700 transition-colors cursor-pointer"
            title="Clear all leads from staging vault"
          >
            Clear Vault
          </button>
        </div>
      </div>

      {isRunningSweep && currentActiveRowName && (
        <div className="px-5 py-2.5 bg-amber-950/60 border-b border-amber-800/40 flex items-center text-xs text-amber-200 font-medium gap-2">
          <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0 animate-spin" />
          <span>Sweeping: <strong className="text-white">{currentActiveRowName}</strong></span>
        </div>
      )}

      {/* Filter and Selection Toolbar */}
      <div className="p-4 bg-slate-900/80 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3 flex-1 max-w-xl">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search staged companies by name or CRO..."
              className="w-full pl-9 pr-3 py-2 bg-slate-800/80 border border-slate-700/80 text-slate-200 placeholder:text-slate-500 rounded-xl focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/50 focus:outline-none"
            />
          </div>
          <select
            value={countyFilter}
            onChange={(e) => setCountyFilter(e.target.value)}
            className="px-3 py-2 bg-slate-800/80 border border-slate-700/80 text-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/50 focus:outline-none font-medium"
          >
            <option value="ALL">All Counties ({stagedLeads.length})</option>
            {counties.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'ALL' | 'PENDING' | 'DISQUALIFIED')}
            className="px-3 py-2 bg-slate-800/80 border border-slate-700/80 text-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/50 focus:outline-none font-medium"
          >
            <option value="ALL">All Statuses</option>
            <option value="PENDING">Pending Sweep ({pendingCount})</option>
            <option value="DISQUALIFIED">Disqualified ({disqualifiedCount})</option>
          </select>
        </div>

        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 bg-amber-950/60 border border-amber-800/60 text-amber-200 px-3 py-1.5 rounded-xl font-medium">
            <span>{selectedIds.size} selected</span>
            <button
              type="button"
              onClick={handleDeleteSelected}
              className="ml-2 px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
              Delete Staged
            </button>
          </div>
        )}
      </div>

      {/* Mini Table Display */}
      <div className="overflow-x-auto max-h-72">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 font-semibold sticky top-0 z-10">
              <th className="p-3 w-10 text-center">
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="hover:text-amber-400 text-slate-500 cursor-pointer"
                >
                  {selectedIds.size === filteredStagedLeads.length && filteredStagedLeads.length > 0 ? (
                    <CheckSquare className="w-4 h-4 text-amber-400" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                </button>
              </th>
              <th className="p-3">CRO / Reg No</th>
              <th className="p-3">Company Name</th>
              <th className="p-3">County / Address</th>
              <th className="p-3">Sweep Status</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 bg-slate-900/40 text-slate-200">
            {filteredStagedLeads.map((lead) => {
              const isSelected = selectedIds.has(lead.id);
              return (
                <tr
                  key={lead.id}
                  className={`hover:bg-slate-800/60 transition-colors ${
                    isSelected ? 'bg-amber-500/10' : ''
                  }`}
                >
                  <td className="p-3 text-center">
                    <button
                      type="button"
                      onClick={() => toggleSelectOne(lead.id)}
                      className="text-slate-500 hover:text-amber-400 cursor-pointer"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-amber-400" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </td>
                  <td className="p-3 font-mono font-medium text-slate-400">{lead.companyNumber}</td>
                  <td className="p-3 font-bold text-slate-100">{lead.companyName}</td>
                  <td className="p-3 text-slate-300">{lead.county}</td>
                  <td className="p-3">
                    {lead.match_type === 'DISQUALIFIED' ? (
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-red-950/80 text-red-300 border border-red-800/60"
                        title={lead.notes || 'Not trading / no verified website found'}
                      >
                        Disqualified ({lead.tradingStatus || 'NOT_FOUND'})
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                        {lead.rawRowData ? `${Object.keys(lead.rawRowData).length} columns captured` : 'Standard row'}
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    <button
                      type="button"
                      onClick={() => onPromoteAndEnrich([lead])}
                      className="px-2.5 py-1 bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-700/60 text-emerald-300 rounded-lg font-semibold text-[11px] inline-flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      Enrich & Promote <ArrowRight className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
