import React, { useState } from 'react';
import { Database, Sparkles, Trash2, ArrowRight, Upload, Search, CheckSquare, Square, RefreshCw, FileSpreadsheet } from 'lucide-react';
import { CompanyRecord } from '../types';

interface StagedLeadsVaultProps {
  stagedLeads: CompanyRecord[];
  onPromoteAndEnrich: (leadsToPromote: CompanyRecord[]) => void;
  onDeleteStagedLeads: (idsToDelete: string[]) => void;
  onClearStagingVault: () => void;
}

export const StagedLeadsVault: React.FC<StagedLeadsVaultProps> = ({
  stagedLeads,
  onPromoteAndEnrich,
  onDeleteStagedLeads,
  onClearStagingVault,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [countyFilter, setCountyFilter] = useState('ALL');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const counties = Array.from(new Set(stagedLeads.map((l) => l.county).filter(Boolean))).sort();

  const filteredStagedLeads = stagedLeads.filter((lead) => {
    const matchesSearch =
      !searchTerm ||
      lead.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.companyNumber.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCounty = countyFilter === 'ALL' || lead.county.toLowerCase() === countyFilter.toLowerCase();

    return matchesSearch && matchesCounty;
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
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-amber-100 rounded-xl text-amber-800">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Tier 1: Staged Raw Leads Vault (Mini Database)</h3>
              <p className="text-xs text-slate-500">
                Uploaded files enter this raw staging vault before batch enrichment.
              </p>
            </div>
          </div>
          <span className="text-xs px-2.5 py-1 bg-slate-100 text-slate-600 font-semibold rounded-full">
            0 Staged Leads
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-4 italic text-center">
          No raw leads currently staged in vault. Import a CSV/XLSX file above or load sample data to populate the staging mini-database.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden transition-all">
      {/* Header */}
      <div className="p-5 bg-gradient-to-r from-amber-900 via-amber-950 to-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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
              Raw leads from your uploaded CSV/XLSX file are held here. Click "Enrich & Promote to Final Data Table" to run website matching.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handlePromoteSelected}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-sm transition-all inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-emerald-200" />
            Enrich & Bring Through {selectedIds.size > 0 ? `(${selectedIds.size})` : 'All'} to Final Table
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onClearStagingVault}
            className="px-3 py-2 bg-amber-950 hover:bg-amber-900 text-amber-200 hover:text-white font-medium text-xs rounded-xl border border-amber-800 transition-colors cursor-pointer"
            title="Clear all leads from staging vault"
          >
            Clear Vault
          </button>
        </div>
      </div>

      {/* Filter and Selection Toolbar */}
      <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3 flex-1 max-w-xl">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search staged companies by name or CRO..."
              className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </div>
          <select
            value={countyFilter}
            onChange={(e) => setCountyFilter(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none"
          >
            <option value="ALL">All Counties ({stagedLeads.length})</option>
            {counties.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 bg-amber-100 border border-amber-300 text-amber-900 px-3 py-1.5 rounded-xl font-medium">
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
            <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-semibold sticky top-0 z-10">
              <th className="p-3 w-10 text-center">
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="hover:text-amber-700 text-slate-400 cursor-pointer"
                >
                  {selectedIds.size === filteredStagedLeads.length && filteredStagedLeads.length > 0 ? (
                    <CheckSquare className="w-4 h-4 text-amber-600" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                </button>
              </th>
              <th className="p-3">CRO / Reg No</th>
              <th className="p-3">Company Name</th>
              <th className="p-3">County / Address</th>
              <th className="p-3">Raw Column Status</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white text-slate-800">
            {filteredStagedLeads.map((lead) => {
              const isSelected = selectedIds.has(lead.id);
              return (
                <tr
                  key={lead.id}
                  className={`hover:bg-amber-50/60 transition-colors ${
                    isSelected ? 'bg-amber-50' : ''
                  }`}
                >
                  <td className="p-3 text-center">
                    <button
                      type="button"
                      onClick={() => toggleSelectOne(lead.id)}
                      className="text-slate-400 hover:text-amber-600 cursor-pointer"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-amber-600" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </td>
                  <td className="p-3 font-mono font-medium text-slate-600">{lead.companyNumber}</td>
                  <td className="p-3 font-bold text-slate-900">{lead.companyName}</td>
                  <td className="p-3 text-slate-700">{lead.county}</td>
                  <td className="p-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
                      {lead.rawRowData ? `${Object.keys(lead.rawRowData).length} columns captured` : 'Standard row'}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <button
                      type="button"
                      onClick={() => onPromoteAndEnrich([lead])}
                      className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 rounded-lg font-semibold text-[11px] inline-flex items-center gap-1 cursor-pointer transition-colors"
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
