import React, { useState, useEffect } from 'react';
import { X, Save, ArrowLeftRight, CheckCircle2, Sparkles, Building2, MapPin, UserCheck, Globe, Phone, Mail, FileText } from 'lucide-react';
import { CompanyRecord } from '../types';
import { cleanNullableField } from '../utils/normalize';

interface EditRowModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: CompanyRecord | null;
  onSave: (updatedRecord: CompanyRecord) => void;
}

/**
 * Merges a record with its edited form data into a normalized CompanyRecord,
 * ready to save. Pure and side-effect-free so it can be unit-tested directly.
 * Uses cleanNullableField (not a bare `.trim() || null`) so that a field the
 * user left untouched — which may still carry a legacy literal "null" string
 * from before the enrichment-side fix — gets cleaned on every save, not only
 * when the user happens to retype that specific field.
 */
export function normalizeEditedRecord(
  record: CompanyRecord,
  formData: Partial<CompanyRecord>
): CompanyRecord {
  const isFb = formData.official_website_url?.toLowerCase().includes('facebook.com');

  return {
    ...record,
    ...formData,
    companyName: (formData.companyName || '').trim(),
    companyNumber: (formData.companyNumber || '').trim(),
    county: (formData.county || 'Ireland').trim(),
    official_website_url: formData.official_website_url?.trim() || null,
    decisionMakerName: cleanNullableField(formData.decisionMakerName),
    decisionMakerRole: cleanNullableField(formData.decisionMakerRole),
    phoneNumber: cleanNullableField(formData.phoneNumber),
    contactEmail: cleanNullableField(formData.contactEmail),
    industry: cleanNullableField(formData.industry),
    isManualEdit: true,
    status: formData.official_website_url ? 'SUCCESS' : record.status,
    match_type: formData.official_website_url
      ? (isFb ? 'FACEBOOK_FALLBACK' : 'OFFICIAL_WEBSITE')
      : record.match_type,
    confidence_score: formData.official_website_url ? 'HIGH' : record.confidence_score,
  };
}

export const EditRowModal: React.FC<EditRowModalProps> = ({
  isOpen,
  onClose,
  record,
  onSave,
}) => {
  const [formData, setFormData] = useState<Partial<CompanyRecord>>({});

  useEffect(() => {
    if (record) {
      setFormData({
        ...record,
        decisionMakerName: cleanNullableField(record.decisionMakerName),
        decisionMakerRole: cleanNullableField(record.decisionMakerRole),
        phoneNumber: cleanNullableField(record.phoneNumber),
        contactEmail: cleanNullableField(record.contactEmail),
        industry: cleanNullableField(record.industry),
      });
    }
  }, [record]);

  if (!isOpen || !record) return null;

  const handleChange = (field: keyof CompanyRecord, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSwapNameAndCro = () => {
    setFormData((prev) => ({
      ...prev,
      companyName: prev.companyNumber || '',
      companyNumber: prev.companyName || '',
    }));
  };

  const handleSwapNameAndCounty = () => {
    setFormData((prev) => ({
      ...prev,
      companyName: prev.county || '',
      county: prev.companyName || 'Ireland',
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.companyName?.trim()) {
      alert('Company Name cannot be empty.');
      return;
    }

    onSave(normalizeEditedRecord(record, formData));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-center justify-between border-b border-slate-700">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600/30 border border-emerald-400/30 flex items-center justify-center text-emerald-400">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                Relabel / Edit Row Data
              </h3>
              <p className="text-xs text-slate-300">
                Correct values for <span className="font-bold text-emerald-300">{record.companyName}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700/60 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Correction Actions */}
        <div className="bg-emerald-50/80 px-6 py-3 border-b border-emerald-200 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-bold text-emerald-900 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-emerald-600" /> Quick Data Swaps:
          </span>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleSwapNameAndCro}
              className="px-2.5 py-1 bg-white hover:bg-emerald-100 border border-emerald-300 text-emerald-800 font-semibold rounded-lg shadow-2xs flex items-center gap-1 transition-colors"
            >
              <ArrowLeftRight className="w-3 h-3 text-emerald-600" /> Swap Name & CRO Number
            </button>
            <button
              type="button"
              onClick={handleSwapNameAndCounty}
              className="px-2.5 py-1 bg-white hover:bg-emerald-100 border border-emerald-300 text-emerald-800 font-semibold rounded-lg shadow-2xs flex items-center gap-1 transition-colors"
            >
              <ArrowLeftRight className="w-3 h-3 text-emerald-600" /> Swap Name & County
            </button>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Company Name */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-blue-600" />
                <span>Company / Business Name <span className="text-red-500">*</span></span>
              </label>
              <input
                type="text"
                required
                value={formData.companyName || ''}
                onChange={(e) => handleChange('companyName', e.target.value)}
                className="w-full px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                placeholder="e.g. Kerry Group PLC"
              />
            </div>

            {/* CRO Reg Number */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-slate-500" />
                <span>CRO Reg No / KMT Number</span>
              </label>
              <input
                type="text"
                value={formData.companyNumber || ''}
                onChange={(e) => handleChange('companyNumber', e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono font-semibold bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                placeholder="e.g. 206631"
              />
            </div>

            {/* County */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-red-500" />
                <span>County / Location</span>
              </label>
              <input
                type="text"
                value={formData.county || ''}
                onChange={(e) => handleChange('county', e.target.value)}
                className="w-full px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                placeholder="e.g. Kerry, Dublin, Cork"
              />
            </div>

            {/* Official Website URL */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-emerald-600" />
                <span>Official Website URL</span>
              </label>
              <input
                type="url"
                value={formData.official_website_url || ''}
                onChange={(e) => handleChange('official_website_url', e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                placeholder="https://www.company.ie"
              />
            </div>

            {/* Decision Maker Name */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-indigo-600" />
                <span>Decision Maker Name</span>
              </label>
              <input
                type="text"
                value={formData.decisionMakerName || ''}
                onChange={(e) => handleChange('decisionMakerName', e.target.value)}
                className="w-full px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                placeholder="e.g. Edmond Scanlon"
              />
            </div>

            {/* Decision Maker Role */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-indigo-400" />
                <span>Decision Maker Role / Title</span>
              </label>
              <input
                type="text"
                value={formData.decisionMakerRole || ''}
                onChange={(e) => handleChange('decisionMakerRole', e.target.value)}
                className="w-full px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                placeholder="e.g. CEO / Managing Director"
              />
            </div>

            {/* Phone Number */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-emerald-600" />
                <span>Phone Number</span>
              </label>
              <input
                type="text"
                value={formData.phoneNumber || ''}
                onChange={(e) => handleChange('phoneNumber', e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                placeholder="+353 66 718 2000"
              />
            </div>

            {/* Contact Email */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-blue-600" />
                <span>Contact Email</span>
              </label>
              <input
                type="email"
                value={formData.contactEmail || ''}
                onChange={(e) => handleChange('contactEmail', e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                placeholder="info@kerrygroup.com"
              />
            </div>

          </div>

          {/* Industry & Research Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                Industry / Sector
              </label>
              <input
                type="text"
                value={formData.industry || ''}
                onChange={(e) => handleChange('industry', e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                placeholder="e.g. Food & Beverage Manufacturing"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                Research Notes
              </label>
              <input
                type="text"
                value={formData.notes || ''}
                onChange={(e) => handleChange('notes', e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                placeholder="Additional notes or custom tags..."
              />
            </div>
          </div>

          {/* Footer buttons */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors shadow-sm gap-1.5"
            >
              <Save className="w-4 h-4" /> Save Relabeled Row
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
