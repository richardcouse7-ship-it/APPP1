import React, { useState } from 'react';
import { X, ExternalLink, Copy, Check, Globe, ShieldCheck, AlertCircle, Search, Edit3, Save, MapPin, Hash, Sparkles, UserCheck, Linkedin } from 'lucide-react';
import { CompanyRecord } from '../types';

interface CompanyDetailModalProps {
  company: CompanyRecord | null;
  onClose: () => void;
  onSaveManualUrl: (id: string, newUrl: string) => void;
  onReEnrichSingle: (company: CompanyRecord) => void;
  isReEnriching: boolean;
}

export const CompanyDetailModal: React.FC<CompanyDetailModalProps> = ({
  company,
  onClose,
  onSaveManualUrl,
  onReEnrichSingle,
  isReEnriching,
}) => {
  if (!company) return null;

  const [isEditing, setIsEditing] = useState(false);
  const [editedUrl, setEditedUrl] = useState(company.official_website_url || '');
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (company.official_website_url) {
      navigator.clipboard.writeText(company.official_website_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSave = () => {
    onSaveManualUrl(company.id, editedUrl.trim());
    setIsEditing(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white p-5 flex items-start justify-between border-b border-slate-800">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800">
                Company Details
              </span>
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <MapPin className="w-3 h-3 text-slate-400" /> County {company.county}
              </span>
            </div>
            <h3 className="text-xl font-bold mt-1 text-white">{company.companyName}</h3>
            <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
              <Hash className="w-3 h-3 text-slate-500" /> CRO / Company Number: <span className="font-mono text-slate-300">{company.companyNumber}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Status & Confidence Grid */}
          <div className="grid grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Status</span>
              <div className="text-xs font-bold text-slate-800 mt-0.5">{company.status}</div>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Match Type</span>
              <div className="mt-0.5">
                {company.match_type === 'OFFICIAL_WEBSITE' && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    Official Website
                  </span>
                )}
                {company.match_type === 'FACEBOOK_FALLBACK' && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                    Facebook Fallback
                  </span>
                )}
                {company.match_type === 'NOT_FOUND' && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                    Not Found
                  </span>
                )}
                {company.match_type === 'UNPROCESSED' && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-500">
                    Pending Run
                  </span>
                )}
              </div>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Confidence Score</span>
              <div className="mt-0.5">
                {company.confidence_score === 'HIGH' && (
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    HIGH (95%+)
                  </span>
                )}
                {company.confidence_score === 'MEDIUM' && (
                  <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                    MEDIUM (70-90%)
                  </span>
                )}
                {company.confidence_score === 'LOW' && (
                  <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                    LOW (&lt;50%)
                  </span>
                )}
                {company.confidence_score === 'NONE' && (
                  <span className="text-xs font-bold text-slate-400">Unassessed</span>
                )}
              </div>
            </div>
          </div>

          {/* Lead Research & Verification Cards */}
          {(company.industry || company.companySummary || company.phoneNumber || company.contactEmail || company.decisionMakerName || company.linkedinUrl || company.icpRating !== undefined || company.reasonForPbsNeed) && (
            <div className="p-4 bg-emerald-50/60 border border-emerald-200/80 rounded-xl space-y-3">
              <h4 className="text-xs font-bold text-emerald-900 uppercase tracking-wider flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" /> B2B Lead Verification Intelligence
                </span>
                <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200">
                  COUNTY: {company.county}
                </span>
              </h4>

              <div className="grid grid-cols-2 gap-3 text-xs">
                {company.decisionMakerName && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500 flex items-center gap-1">
                      <UserCheck className="w-3 h-3 text-emerald-600" /> Key Decision Maker
                    </span>
                    <p className="font-bold text-slate-900 mt-0.5">{company.decisionMakerName}</p>
                    {company.decisionMakerRole && (
                      <p className="text-[11px] font-medium text-slate-600">{company.decisionMakerRole}</p>
                    )}
                  </div>
                )}
                {company.linkedinUrl ? (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500 flex items-center gap-1">
                      <Linkedin className="w-3 h-3 text-blue-600" /> LinkedIn ({company.linkedinType === 'DECISION_MAKER' ? 'DM Profile' : 'Company Page'})
                    </span>
                    <a
                      href={company.linkedinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center text-xs font-semibold text-blue-700 hover:text-blue-900 hover:underline mt-0.5"
                    >
                      View LinkedIn <ExternalLink className="w-3 h-3 ml-1" />
                    </a>
                  </div>
                ) : company.status === 'SUCCESS' && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500 flex items-center gap-1">
                      <Linkedin className="w-3 h-3 text-slate-400" /> LinkedIn
                    </span>
                    <p className="text-xs italic text-slate-400 mt-0.5">Not Found</p>
                  </div>
                )}
                {company.industry && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500">Industry / Sector</span>
                    <p className="font-semibold text-slate-800 mt-0.5">{company.industry}</p>
                  </div>
                )}
                {company.estimatedSize && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500">Estimated Size</span>
                    <p className="font-semibold text-slate-800 mt-0.5">{company.estimatedSize}</p>
                  </div>
                )}
                {company.phoneNumber && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500">Public Phone</span>
                    <p className="font-mono text-slate-800 mt-0.5">{company.phoneNumber}</p>
                  </div>
                )}
                {company.contactEmail && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500">Public Email</span>
                    <p className="font-mono text-slate-800 mt-0.5 truncate">{company.contactEmail}</p>
                  </div>
                )}
              </div>

              {/* PBS = Peninsula Business Services Need Assessment */}
              {(company.icpRating !== undefined || company.reasonForPbsNeed) && (
                <div className="pt-2.5 border-t border-emerald-200/80 bg-white/70 p-3 rounded-lg border">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" /> PBS Need Assessment
                      <span className="text-[9px] font-normal text-slate-500 normal-case">(Peninsula Business Services: HR & Safety)</span>
                    </span>
                    {company.icpRating !== null && company.icpRating !== undefined && (
                      <span className={`px-2 py-0.5 text-xs font-extrabold rounded-md ${
                        company.icpRating >= 70 ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                        company.icpRating >= 40 ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                        'bg-slate-100 text-slate-700 border border-slate-300'
                      }`}>
                        ICP RATING: {company.icpRating}/100
                      </span>
                    )}
                  </div>
                  {company.reasonForPbsNeed && (
                    <p className="text-xs text-slate-700 font-medium leading-relaxed mt-1">
                      <span className="font-bold text-slate-900">Reason for PBS Need:</span> {company.reasonForPbsNeed}
                    </p>
                  )}
                </div>
              )}

              {company.companySummary && (
                <div className="pt-2 border-t border-emerald-200/60">
                  <span className="text-[10px] uppercase font-bold text-slate-500">Company Overview</span>
                  <p className="text-xs text-slate-700 mt-0.5 leading-relaxed">{company.companySummary}</p>
                </div>
              )}
            </div>
          )}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-emerald-600" /> Official Website Domain
              </label>
              {!isEditing && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="text-xs text-emerald-700 hover:text-emerald-800 font-semibold flex items-center gap-1"
                >
                  <Edit3 className="w-3 h-3" /> Edit URL
                </button>
              )}
            </div>

            {isEditing ? (
              <div className="flex items-center space-x-2">
                <input
                  type="url"
                  value={editedUrl}
                  onChange={(e) => setEditedUrl(e.target.value)}
                  placeholder="https://example.ie"
                  className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-mono"
                />
                <button
                  onClick={handleSave}
                  className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 flex items-center gap-1"
                >
                  <Save className="w-3.5 h-3.5" /> Save
                </button>
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-3 py-2 bg-slate-100 text-slate-600 rounded-lg text-xs font-semibold hover:bg-slate-200"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl">
                {company.official_website_url ? (
                  <div className="flex items-center space-x-2 truncate mr-2">
                    <a
                      href={company.official_website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-semibold text-emerald-700 hover:underline truncate font-mono flex items-center gap-1.5"
                    >
                      {company.official_website_url}
                      <ExternalLink className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    </a>
                  </div>
                ) : (
                  <span className="text-sm italic text-slate-400">No official website domain detected</span>
                )}

                {company.official_website_url && (
                  <button
                    onClick={handleCopy}
                    className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 rounded-md transition-colors"
                    title="Copy URL"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Research Notes */}
          <div className="space-y-1.5">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" /> AI Grounding Research Notes
            </h4>
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 leading-relaxed">
              {company.notes || 'No research notes available yet. Click "Re-Verify Single Company" to perform live research.'}
            </div>
          </div>

          {/* Grounding Web Sources */}
          {company.grounding_sources && company.grounding_sources.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Search className="w-3.5 h-3.5 text-blue-600" /> Google Search Grounding Evidence ({company.grounding_sources.length})
              </h4>
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {company.grounding_sources.map((source, idx) => (
                  <a
                    key={idx}
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200/70 hover:bg-blue-50/50 hover:border-blue-200 transition-colors text-xs text-slate-700 group"
                  >
                    <span className="font-medium truncate mr-2 group-hover:text-blue-700">{source.title}</span>
                    <ExternalLink className="w-3 h-3 text-slate-400 group-hover:text-blue-600 shrink-0" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            onClick={() => onReEnrichSingle(company)}
            disabled={isReEnriching}
            className="px-3 py-2 text-xs font-bold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 rounded-lg border border-emerald-300 transition-colors inline-flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            {isReEnriching ? 'Re-Verifying...' : 'Re-Verify Single Company'}
          </button>

          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg shadow-2xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
