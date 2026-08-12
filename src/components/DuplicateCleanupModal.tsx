import React from 'react';
import { X, AlertTriangle, Sparkles, Trash2, CheckCircle2, Globe, Building2 } from 'lucide-react';
import { CompanyRecord } from '../types';
import { DuplicateGroup } from '../utils/duplicateUtils';

interface DuplicateCleanupModalProps {
  isOpen: boolean;
  onClose: () => void;
  duplicateGroups: DuplicateGroup[];
  onAutoCleanAll: () => void;
  onDeleteRecord: (id: string) => void;
  onKeepRecordInGroup: (groupId: string, keepId: string) => void;
}

export const DuplicateCleanupModal: React.FC<DuplicateCleanupModalProps> = ({
  isOpen,
  onClose,
  duplicateGroups,
  onAutoCleanAll,
  onDeleteRecord,
  onKeepRecordInGroup,
}) => {
  if (!isOpen) return null;

  const totalDuplicatesCount = duplicateGroups.reduce(
    (acc, g) => acc + (g.records.length - 1),
    0
  );

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden my-8 animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-amber-50/70">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-amber-100 text-amber-800 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-amber-700" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                Duplicate Company Review
                <span className="bg-amber-200 text-amber-900 text-xs font-black px-2 py-0.5 rounded-full">
                  {duplicateGroups.length} Groups ({totalDuplicatesCount} Duplicates)
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Review companies sharing identical Company / CRO numbers before enrichment.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Toolbar */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <span className="text-slate-600 font-medium">
            Multiple records share the same official registration number. You can select which record to keep or clean all automatically.
          </span>
          <button
            onClick={() => {
              onAutoCleanAll();
              onClose();
            }}
            className="inline-flex items-center px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition-colors shrink-0 gap-1.5 cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            Auto-Deduplicate All
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto">
          {duplicateGroups.length === 0 ? (
            <div className="py-12 text-center text-slate-500 space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
              <p className="text-sm font-bold text-slate-800">No duplicate company numbers found!</p>
              <p className="text-xs text-slate-500">Your dataset is clean and ready for enrichment.</p>
            </div>
          ) : (
            duplicateGroups.map((group, gIdx) => (
              <div
                key={group.normalizedNumber || gIdx}
                className="border border-amber-200 rounded-xl overflow-hidden bg-white shadow-2xs"
              >
                {/* Group Title Bar */}
                <div className="px-4 py-2.5 bg-amber-50/80 border-b border-amber-200 flex items-center justify-between text-xs font-bold text-amber-900">
                  <div className="flex items-center space-x-2">
                    <Building2 className="w-4 h-4 text-amber-700" />
                    <span>Company / CRO Number: <strong className="text-amber-950 font-black px-1.5 py-0.5 bg-amber-100 rounded border border-amber-200">{group.companyNumber}</strong></span>
                    <span className="text-amber-700 font-normal">({group.records.length} records)</span>
                  </div>
                </div>

                {/* Group Records List */}
                <div className="divide-y divide-slate-100">
                  {group.records.map((record, rIdx) => (
                    <div
                      key={record.id}
                      className="p-3.5 hover:bg-slate-50/80 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-extrabold text-slate-900">{record.companyName}</span>
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-medium">
                            County {record.county}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                              record.status === 'SUCCESS'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {record.status}
                          </span>
                        </div>

                        {record.official_website_url && (
                          <div className="text-xs text-emerald-700 flex items-center gap-1 font-medium">
                            <Globe className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <a
                              href={record.official_website_url}
                              target="_blank"
                              rel="noreferrer"
                              className="hover:underline truncate max-w-md"
                            >
                              {record.official_website_url}
                            </a>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center space-x-2 shrink-0 self-start sm:self-auto">
                        <button
                          type="button"
                          onClick={() => onKeepRecordInGroup(group.normalizedNumber, record.id)}
                          className="px-2.5 py-1 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors cursor-pointer"
                        >
                          Keep This Only
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteRecord(record.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          title="Delete this individual duplicate record"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs">
          <span className="text-slate-500 font-medium">
            {duplicateGroups.length} duplicate group(s) remaining
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 font-bold text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Done Reviewing
          </button>
        </div>
      </div>
    </div>
  );
};
