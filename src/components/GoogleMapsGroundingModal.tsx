import React, { useState } from 'react';
import { MapPin, Search, X, Loader2, Globe, Star, Plus, CheckCircle2 } from 'lucide-react';
import { CompanyRecord } from '../types';
import { apiFetch } from '../lib/apiClient';

interface GoogleMapsGroundingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddCompaniesToDataset: (newCompanies: Partial<CompanyRecord>[]) => void;
}

export const GoogleMapsGroundingModal: React.FC<GoogleMapsGroundingModalProps> = ({
  isOpen,
  onClose,
  onAddCompaniesToDataset,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [county, setCounty] = useState('Dublin');
  const [isLoading, setIsLoading] = useState(false);
  const [resultText, setResultText] = useState<string | null>(null);
  const [sources, setSources] = useState<any[]>([]);
  const [addedNotice, setAddedNotice] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSearchMaps = async () => {
    if (!searchQuery.trim() || isLoading) return;
    setIsLoading(true);
    setResultText(null);
    setSources([]);
    setAddedNotice(null);

    try {
      const res = await apiFetch('/api/maps-search', {
        method: 'POST',
        body: JSON.stringify({ query: searchQuery, county }),
      });

      if (!res.ok) throw new Error('Maps search request failed');
      const data = await res.json();
      setResultText(data.text);
      setSources(data.sources || []);
    } catch (err: any) {
      setResultText(`Search Error: ${err.message || 'Failed to search Google Maps'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleImportResults = () => {
    if (!sources || sources.length === 0) return;

    const imported: Partial<CompanyRecord>[] = sources.map((src, idx) => ({
      id: `map-${Date.now()}-${idx}`,
      companyName: src.title || searchQuery,
      county: county,
      official_website_url: src.url || null,
      confidence_score: src.url ? 'HIGH' : 'MEDIUM',
      match_type: src.url ? 'OFFICIAL_WEBSITE' : 'NOT_FOUND',
      status: 'PENDING',
      notes: `Discovered via Google Maps Grounding search for "${searchQuery}" in ${county}.`,
    }));

    onAddCompaniesToDataset(imported);
    setAddedNotice(`Successfully added ${imported.length} leads from Google Maps to your active dataset!`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-teal-800 via-emerald-800 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/20 rounded-xl backdrop-blur-md border border-emerald-400/30">
              <MapPin className="w-5 h-5 text-emerald-300" />
            </div>
            <div>
              <h3 className="font-semibold text-lg text-white">Google Maps Grounding</h3>
              <p className="text-xs text-emerald-200">Live Irish Business Geographic Search</p>
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
        <div className="p-6 overflow-y-auto space-y-4 flex-1 bg-slate-50/50">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Business Type / Keywords:
              </label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearchMaps()}
                placeholder="e.g. Software engineering firms, Creameries, Logistics..."
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                County:
              </label>
              <select
                value={county}
                onChange={(e) => setCounty(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              >
                {['Cork', 'Dublin', 'Galway', 'Limerick', 'Waterford', 'Kerry', 'Kildare', 'Donegal', 'All Ireland'].map(
                  (c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  )
                )}
              </select>
            </div>
          </div>

          <button
            onClick={handleSearchMaps}
            disabled={!searchQuery.trim() || isLoading}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-medium text-sm rounded-xl transition-all shadow-2xs cursor-pointer"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Searching Google Maps Data...
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                Search Google Maps
              </>
            )}
          </button>

          {addedNotice && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-medium flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              {addedNotice}
            </div>
          )}

          {resultText && (
            <div className="space-y-3 bg-white p-4 border border-slate-200 rounded-xl text-xs text-slate-800 shadow-2xs">
              <div className="font-semibold text-slate-900 text-sm border-b border-slate-100 pb-2 flex items-center justify-between">
                <span>Google Maps Search Results</span>
                {sources.length > 0 && (
                  <button
                    onClick={handleImportResults}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-emerald-100 hover:bg-emerald-200 text-emerald-900 rounded-lg transition-colors font-semibold cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Import to Dataset
                  </button>
                )}
              </div>
              <div className="whitespace-pre-wrap leading-relaxed">{resultText}</div>

              {sources.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5">
                  <span className="font-semibold text-slate-700 block">Grounding Citations:</span>
                  {sources.map((src, i) => (
                    <a
                      key={i}
                      href={src.url || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs text-emerald-700 hover:underline truncate"
                    >
                      <Globe className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      {src.title || src.url}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
