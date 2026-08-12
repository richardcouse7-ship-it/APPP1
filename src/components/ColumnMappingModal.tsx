import React, { useState, useEffect, useMemo } from 'react';
import { X, Table, Sparkles, Check, AlertCircle, ArrowRight, RefreshCw, Layers, Edit3, ArrowLeftRight, Eye, CheckCircle2, Search, SlidersHorizontal } from 'lucide-react';
import { CustomColumnMapping, extractRecordsWithCustomMapping, smartExtractAndHealRecords, analyzeColumnsContent, ColumnAnalysis } from '../utils/csvUtils';
import { CompanyRecord } from '../types';

interface ColumnMappingModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  headers: string[];
  rows: any[];
  onConfirmImport: (records: CompanyRecord[], autoCorrections: string[]) => void;
}

export const ColumnMappingModal: React.FC<ColumnMappingModalProps> = ({
  isOpen,
  onClose,
  fileName,
  headers,
  rows,
  onConfirmImport,
}) => {
  // Local state for custom column header relabeling
  const [customHeaders, setCustomHeaders] = useState<string[]>([]);
  // Local state for editable rows (allows relabeling individual cell values)
  const [editableRows, setEditableRows] = useState<any[]>([]);

  const [mapping, setMapping] = useState<CustomColumnMapping>({
    companyNameKey: '',
    companyNumberKey: '',
    countyKey: '',
    decisionMakerNameKey: '',
    decisionMakerRoleKey: '',
  });

  const [applyRowHealing, setApplyRowHealing] = useState<boolean>(true);
  const [autoCorrections, setAutoCorrections] = useState<string[]>([]);
  const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null);

  // Initialize editable copy of headers and rows when modal opens
  useEffect(() => {
    if (headers && headers.length > 0) {
      setCustomHeaders([...headers]);
    }
    if (rows && rows.length > 0) {
      setEditableRows(rows.map((r) => ({ ...r })));
    }
  }, [headers, rows]);

  // Deep column pattern analysis across data rows
  const columnAnalyses: ColumnAnalysis[] = useMemo(() => {
    if (editableRows.length === 0 || customHeaders.length === 0) return [];
    return analyzeColumnsContent(editableRows, customHeaders);
  }, [editableRows, customHeaders]);

  // Auto-detect mappings based on smart extraction + column analyses
  useEffect(() => {
    if (customHeaders.length > 0 && editableRows.length > 0) {
      const autoResult = smartExtractAndHealRecords(editableRows, customHeaders);
      
      // Also check content analyses for higher precision
      const nameCol = columnAnalyses.find((c) => c.bestMatchRole === 'companyName')?.header;
      const croCol = columnAnalyses.find((c) => c.bestMatchRole === 'companyNumber')?.header;
      const countyCol = columnAnalyses.find((c) => c.bestMatchRole === 'county')?.header;
      const dmNameCol = columnAnalyses.find((c) => c.bestMatchRole === 'decisionMakerName')?.header;
      const dmRoleCol = columnAnalyses.find((c) => c.bestMatchRole === 'decisionMakerRole')?.header;

      setMapping({
        companyNameKey: nameCol || autoResult.columnMapping.companyNameKey || customHeaders[0] || '',
        companyNumberKey: croCol || autoResult.columnMapping.companyNumberKey || '',
        countyKey: countyCol || autoResult.columnMapping.countyKey || '',
        decisionMakerNameKey: dmNameCol || customHeaders.find((h) => /decision\s*maker|ceo|executive|director|contact\s*name/i.test(h)) || '',
        decisionMakerRoleKey: dmRoleCol || customHeaders.find((h) => /role|title|position|job\s*title/i.test(h)) || '',
      });
      setAutoCorrections(autoResult.autoCorrections);
    }
  }, [customHeaders, editableRows]);

  if (!isOpen) return null;

  const handleAutoDetect = () => {
    const autoResult = smartExtractAndHealRecords(editableRows, customHeaders);
    const nameCol = columnAnalyses.find((c) => c.bestMatchRole === 'companyName')?.header;
    const croCol = columnAnalyses.find((c) => c.bestMatchRole === 'companyNumber')?.header;
    const countyCol = columnAnalyses.find((c) => c.bestMatchRole === 'county')?.header;
    const dmNameCol = columnAnalyses.find((c) => c.bestMatchRole === 'decisionMakerName')?.header;
    const dmRoleCol = columnAnalyses.find((c) => c.bestMatchRole === 'decisionMakerRole')?.header;

    setMapping({
      companyNameKey: nameCol || autoResult.columnMapping.companyNameKey || customHeaders[0] || '',
      companyNumberKey: croCol || autoResult.columnMapping.companyNumberKey || '',
      countyKey: countyCol || autoResult.columnMapping.countyKey || '',
      decisionMakerNameKey: dmNameCol || customHeaders.find((h) => /decision\s*maker|ceo|executive|director|contact\s*name/i.test(h)) || '',
      decisionMakerRoleKey: dmRoleCol || customHeaders.find((h) => /role|title|position|job\s*title/i.test(h)) || '',
    });
    setAutoCorrections(autoResult.autoCorrections);
  };

  // Header Relabel / Rename handler
  const handleRenameHeader = (oldHeader: string, newHeaderName: string) => {
    const trimmed = newHeaderName.trim();
    if (!trimmed || trimmed === oldHeader) return;

    setCustomHeaders((prev) =>
      prev.map((h) => (h === oldHeader ? trimmed : h))
    );

    // Update keys in editableRows
    setEditableRows((prev) =>
      prev.map((row) => {
        const newRow = { ...row };
        if (oldHeader in newRow) {
          newRow[trimmed] = newRow[oldHeader];
          delete newRow[oldHeader];
        }
        return newRow;
      })
    );

    // Update active mappings
    setMapping((prev) => ({
      companyNameKey: prev.companyNameKey === oldHeader ? trimmed : prev.companyNameKey,
      companyNumberKey: prev.companyNumberKey === oldHeader ? trimmed : prev.companyNumberKey,
      countyKey: prev.countyKey === oldHeader ? trimmed : prev.countyKey,
      decisionMakerNameKey: prev.decisionMakerNameKey === oldHeader ? trimmed : prev.decisionMakerNameKey,
      decisionMakerRoleKey: prev.decisionMakerRoleKey === oldHeader ? trimmed : prev.decisionMakerRoleKey,
    }));
  };

  // Inline Row Cell Relabel handler
  const handleCellChange = (rowIndex: number, columnHeader: string, newValue: string) => {
    setEditableRows((prev) =>
      prev.map((r, idx) => (idx === rowIndex ? { ...r, [columnHeader]: newValue } : r))
    );
  };

  const handleConfirm = () => {
    if (!mapping.companyNameKey) {
      alert('Please select which column contains the Company / Business Name.');
      return;
    }

    const { records, autoCorrections: corrections } = extractRecordsWithCustomMapping(
      editableRows,
      mapping,
      applyRowHealing
    );

    onConfirmImport(records, corrections);
    onClose();
  };

  // Format readable role titles
  const getRoleBadge = (analysis?: ColumnAnalysis) => {
    if (!analysis || analysis.bestMatchRole === 'unknown') return null;
    const roleLabels: Record<string, { label: string; color: string }> = {
      companyName: { label: `Identified: Company Name (${analysis.confidenceScore}%)`, color: 'bg-blue-100 text-blue-900 border-blue-300' },
      companyNumber: { label: `Identified: CRO/KMT Reg (${analysis.confidenceScore}%)`, color: 'bg-purple-100 text-purple-900 border-purple-300' },
      county: { label: `Identified: County/Location (${analysis.confidenceScore}%)`, color: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
      decisionMakerName: { label: `Identified: Decision Maker (${analysis.confidenceScore}%)`, color: 'bg-indigo-100 text-indigo-900 border-indigo-300' },
      decisionMakerRole: { label: `Identified: Job Role/Title (${analysis.confidenceScore}%)`, color: 'bg-sky-100 text-sky-900 border-sky-300' },
      phoneNumber: { label: `Identified: Phone (${analysis.confidenceScore}%)`, color: 'bg-teal-100 text-teal-900 border-teal-300' },
      contactEmail: { label: `Identified: Email (${analysis.confidenceScore}%)`, color: 'bg-amber-100 text-amber-900 border-amber-300' },
    };
    const conf = roleLabels[analysis.bestMatchRole];
    if (!conf) return null;
    return (
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${conf.color}`}>
        {conf.label}
      </span>
    );
  };

  // Generate live preview sample rows (up to 5 rows)
  const previewRows = editableRows.slice(0, 5).map((row, idx) => {
    const name = mapping.companyNameKey ? (row[mapping.companyNameKey] || '').toString().trim() : '';
    const cro = mapping.companyNumberKey ? (row[mapping.companyNumberKey] || '').toString().trim() : '';
    const county = mapping.countyKey ? (row[mapping.countyKey] || '').toString().trim() : 'Ireland';
    const dmName = mapping.decisionMakerNameKey ? (row[mapping.decisionMakerNameKey] || '').toString().trim() : '';
    const dmRole = mapping.decisionMakerRoleKey ? (row[mapping.decisionMakerRoleKey] || '').toString().trim() : '';

    return { idx, name, cro, county, dmName, dmRole, rawRow: row };
  });

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-center justify-between border-b border-slate-700">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-400/30 flex items-center justify-center text-blue-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                Relabel Columns & Align Rows
              </h3>
              <p className="text-xs text-slate-300">
                File: <span className="font-semibold text-blue-300">{fileName}</span> ({editableRows.length} rows, {customHeaders.length} columns)
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

        {/* Modal Body */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          
          {/* Smart Auto-Identification Notice */}
          <div className="flex items-start justify-between p-3.5 bg-blue-50/90 border border-blue-200 rounded-xl text-xs text-blue-900">
            <div className="flex items-start space-x-2.5">
              <Sparkles className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-blue-950">Content Pattern Inspector & Relabeling Active</p>
                <p className="text-blue-800 mt-0.5">
                  Our algorithm sampled your dataset to identify where actual company names, CRO numbers, and counties are located. You can also rename headers or edit specific rows below.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleAutoDetect}
              className="px-2.5 py-1 text-[11px] font-bold text-blue-800 bg-white border border-blue-300 rounded-lg hover:bg-blue-100 flex items-center gap-1 shrink-0 ml-2 shadow-2xs"
            >
              <RefreshCw className="w-3 h-3 text-blue-600" /> Re-Analyze Columns
            </button>
          </div>

          {/* SECTION 1: COLUMN IDENTIFIER & RELABELING CARDS */}
          <div>
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <SlidersHorizontal className="w-4 h-4 text-purple-600" /> 1. Identify & Relabel CSV Columns
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {columnAnalyses.map((analysis) => {
                const isMappedName = mapping.companyNameKey === analysis.header;
                const isMappedCro = mapping.companyNumberKey === analysis.header;
                const isMappedCounty = mapping.countyKey === analysis.header;
                const isMappedDm = mapping.decisionMakerNameKey === analysis.header;

                return (
                  <div
                    key={analysis.index}
                    className={`p-3.5 rounded-xl border transition-all text-xs space-y-2 ${
                      isMappedName
                        ? 'bg-blue-50/70 border-blue-300 ring-1 ring-blue-400'
                        : isMappedCro
                        ? 'bg-purple-50/70 border-purple-300'
                        : isMappedCounty
                        ? 'bg-emerald-50/70 border-emerald-300'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-mono text-[10px] font-bold text-slate-400 uppercase">
                        Col #{analysis.index + 1}
                      </span>
                      {getRoleBadge(analysis)}
                    </div>

                    {/* Column Relabel Header Input */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                        Column Name / Relabel:
                      </label>
                      <input
                        type="text"
                        value={analysis.header}
                        onChange={(e) => handleRenameHeader(analysis.header, e.target.value)}
                        className="w-full px-2.5 py-1 text-xs font-bold text-slate-900 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Rename column..."
                      />
                    </div>

                    {/* Sample Values Preview */}
                    <div>
                      <span className="text-[10px] font-semibold text-slate-400 block mb-1">
                        Sample Cell Data:
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {analysis.sampleValues.map((v, i) => (
                          <span
                            key={i}
                            className="px-1.5 py-0.5 bg-white border border-slate-200 text-slate-700 rounded text-[10px] font-mono truncate max-w-[120px]"
                            title={v}
                          >
                            {v}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* SECTION 2: MAP COLUMNS TO DATABASE FIELDS */}
          <div>
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-blue-600" /> 2. Map Identified Columns to System Database Fields
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
              
              {/* Field 1: Company Name */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center justify-between">
                  <span>Company / Business Name <span className="text-red-500">*</span></span>
                  <span className="text-[10px] text-blue-700 font-semibold">(Target Field)</span>
                </label>
                <select
                  value={mapping.companyNameKey}
                  onChange={(e) => setMapping({ ...mapping, companyNameKey: e.target.value })}
                  className="w-full px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-800"
                >
                  <option value="">-- Select Column --</option>
                  {customHeaders.map((h, i) => (
                    <option key={i} value={h}>
                      Col {i + 1}: "{h}"
                    </option>
                  ))}
                </select>
              </div>

              {/* Field 2: CRO Reg Number */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center justify-between">
                  <span>CRO Reg No / KMT Number</span>
                  <span className="text-[10px] text-slate-400 font-normal">(Optional)</span>
                </label>
                <select
                  value={mapping.companyNumberKey}
                  onChange={(e) => setMapping({ ...mapping, companyNumberKey: e.target.value })}
                  className="w-full px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-800"
                >
                  <option value="">-- None / Auto-Generate --</option>
                  {customHeaders.map((h, i) => (
                    <option key={i} value={h}>
                      Col {i + 1}: "{h}"
                    </option>
                  ))}
                </select>
              </div>

              {/* Field 3: County */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center justify-between">
                  <span>County / Location</span>
                  <span className="text-[10px] text-slate-400 font-normal">(Default: Ireland)</span>
                </label>
                <select
                  value={mapping.countyKey}
                  onChange={(e) => setMapping({ ...mapping, countyKey: e.target.value })}
                  className="w-full px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-800"
                >
                  <option value="">-- None / Default Ireland --</option>
                  {customHeaders.map((h, i) => (
                    <option key={i} value={h}>
                      Col {i + 1}: "{h}"
                    </option>
                  ))}
                </select>
              </div>

              {/* Field 4: Decision Maker Name */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center justify-between">
                  <span>Decision Maker Name</span>
                  <span className="text-[10px] text-slate-400 font-normal">(Optional)</span>
                </label>
                <select
                  value={mapping.decisionMakerNameKey || ''}
                  onChange={(e) => setMapping({ ...mapping, decisionMakerNameKey: e.target.value })}
                  className="w-full px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-800"
                >
                  <option value="">-- None --</option>
                  {customHeaders.map((h, i) => (
                    <option key={i} value={h}>
                      Col {i + 1}: "{h}"
                    </option>
                  ))}
                </select>
              </div>

            </div>
          </div>

          {/* Row Auto-Healing Checkbox */}
          <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-200">
            <div className="flex items-center space-x-3">
              <input
                type="checkbox"
                id="rowHealingToggle"
                checked={applyRowHealing}
                onChange={(e) => setApplyRowHealing(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
              />
              <label htmlFor="rowHealingToggle" className="text-xs font-semibold text-slate-800 cursor-pointer">
                Enable Smart Content Auto-Healing
                <span className="block text-[11px] font-normal text-slate-500">
                  Automatically detects and swaps inverted cells (e.g. if a row has the business name in the CRO field or county in the name field).
                </span>
              </label>
            </div>
          </div>

          {/* SECTION 3: LIVE PREVIEW & EDITABLE ROWS */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Table className="w-4 h-4 text-blue-600" /> 3. Live Sample Mapping & Editable Rows
              </h4>
              <span className="text-[11px] text-slate-500">Double click or click cell inputs to edit row values</span>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-x-auto text-xs">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3 border-r border-slate-200 text-center w-12">Row</th>
                    <th className="py-2.5 px-3 border-r border-slate-200 bg-blue-50/80 text-blue-900">
                      Mapped Company Name
                    </th>
                    <th className="py-2.5 px-3 border-r border-slate-200 bg-slate-50">
                      Mapped CRO Reg No
                    </th>
                    <th className="py-2.5 px-3 border-r border-slate-200">
                      Mapped County
                    </th>
                    <th className="py-2.5 px-3">
                      Decision Maker
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-medium text-slate-700">
                  {previewRows.map((p) => (
                    <tr key={p.idx} className="hover:bg-slate-50/80">
                      <td className="py-2 px-3 text-slate-400 border-r border-slate-200 text-center font-mono text-[11px]">
                        #{p.idx + 1}
                      </td>

                      {/* Editable Company Name Cell */}
                      <td className="py-1.5 px-2 border-r border-slate-200 bg-blue-50/20">
                        {mapping.companyNameKey ? (
                          <input
                            type="text"
                            value={p.rawRow[mapping.companyNameKey] || ''}
                            onChange={(e) => handleCellChange(p.idx, mapping.companyNameKey, e.target.value)}
                            className="w-full px-2 py-1 text-xs font-bold text-slate-900 bg-white border border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
                            placeholder="Enter business name..."
                          />
                        ) : (
                          <span className="text-red-400 italic">Unmapped</span>
                        )}
                      </td>

                      {/* Editable CRO Cell */}
                      <td className="py-1.5 px-2 border-r border-slate-200">
                        {mapping.companyNumberKey ? (
                          <input
                            type="text"
                            value={p.rawRow[mapping.companyNumberKey] || ''}
                            onChange={(e) => handleCellChange(p.idx, mapping.companyNumberKey, e.target.value)}
                            className="w-full px-2 py-1 text-xs font-mono text-slate-800 bg-white border border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
                            placeholder="Auto-generated if empty"
                          />
                        ) : (
                          <span className="text-slate-400 italic">Auto-generated</span>
                        )}
                      </td>

                      {/* Editable County Cell */}
                      <td className="py-1.5 px-2 border-r border-slate-200">
                        {mapping.countyKey ? (
                          <input
                            type="text"
                            value={p.rawRow[mapping.countyKey] || ''}
                            onChange={(e) => handleCellChange(p.idx, mapping.countyKey, e.target.value)}
                            className="w-full px-2 py-1 text-xs text-slate-800 bg-white border border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
                            placeholder="Ireland"
                          />
                        ) : (
                          <span className="text-slate-500 font-semibold">Ireland</span>
                        )}
                      </td>

                      {/* Editable Decision Maker Cell */}
                      <td className="py-1.5 px-2">
                        {mapping.decisionMakerNameKey ? (
                          <input
                            type="text"
                            value={p.rawRow[mapping.decisionMakerNameKey] || ''}
                            onChange={(e) => handleCellChange(p.idx, mapping.decisionMakerNameKey, e.target.value)}
                            className="w-full px-2 py-1 text-xs text-slate-800 bg-white border border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
                            placeholder="Name..."
                          />
                        ) : (
                          <span className="text-slate-300">&mdash;</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>
          
          <button
            onClick={handleConfirm}
            className="inline-flex items-center px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-sm gap-2"
          >
            <span>Confirm Mapping & Import {editableRows.length} Records</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

      </div>
    </div>
  );
};
