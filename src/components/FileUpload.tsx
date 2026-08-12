import React, { useRef, useState } from 'react';
import { Upload, FileSpreadsheet, Download, Sparkles, Check, AlertCircle, Info, FileText, Globe, RefreshCw, X, Search, Plus, Layers } from 'lucide-react';
import { parseCSVRaw, generateSampleCSVString, downloadCSV } from '../utils/csvUtils';
import { CompanyRecord } from '../types';
import { listUserGoogleSheets, importLeadsFromGoogleSheet, DriveFileItem, GoogleAuthExpiredError } from '../services/workspaceService';
import { User } from 'firebase/auth';
import { ColumnMappingModal } from './ColumnMappingModal';

interface FileUploadProps {
  onRecordsUploaded: (records: CompanyRecord[]) => void;
  onLoadSampleData: () => void;
  currentCount: number;
  user: User | null;
  accessToken: string | null;
  onGoogleSignIn: () => void;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  onRecordsUploaded,
  onLoadSampleData,
  currentCount,
  user,
  accessToken,
  onGoogleSignIn,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [autoCorrections, setAutoCorrections] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [showFormatGuide, setShowFormatGuide] = useState(false);
  const [showSingleSearch, setShowSingleSearch] = useState(false);
  const [singleName, setSingleName] = useState('');
  const [singleCounty, setSingleCounty] = useState('');
  const [singleCro, setSingleCro] = useState('');

  const handleAddSingleBusiness = (e: React.FormEvent) => {
    e.preventDefault();
    if (!singleName.trim()) return;

    const newRecord: CompanyRecord = {
      id: `record-single-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      companyName: singleName.trim(),
      county: singleCounty.trim() || 'Ireland',
      companyNumber: singleCro.trim() || `CRO-${Math.floor(100000 + Math.random() * 900000)}`,
      status: 'PENDING',
      official_website_url: null,
      confidence_score: 'NONE',
      match_type: 'UNPROCESSED',
    };

    onRecordsUploaded([newRecord]);
    setSingleName('');
    setSingleCounty('');
    setSingleCro('');
    setFileName(`Added: ${newRecord.companyName}`);
  };

  // Drive import state
  const [showDriveModal, setShowDriveModal] = useState(false);
  const [driveFiles, setDriveFiles] = useState<DriveFileItem[]>([]);
  const [isLoadingDriveFiles, setIsLoadingDriveFiles] = useState(false);
  const [isImportingSheet, setIsImportingSheet] = useState(false);
  const [driveError, setDriveError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await processFile(file);
    }
  };

  // Column mapping modal state
  const [isMappingModalOpen, setIsMappingModalOpen] = useState(false);
  const [mappingHeaders, setMappingHeaders] = useState<string[]>([]);
  const [mappingRows, setMappingRows] = useState<any[]>([]);
  const [mappingFileName, setMappingFileName] = useState<string>('');

  const processFile = async (file: File) => {
    if (!file.name.endsWith('.csv') && file.type !== 'text/csv' && !file.type.includes('spreadsheet')) {
      setUploadError('Please upload a valid .csv file.');
      return;
    }

    setUploadError(null);
    setAutoCorrections([]);
    setFileName(file.name);

    const { headers, rows, errors } = await parseCSVRaw(file);
    if (errors.length > 0) {
      setUploadError(errors.join(' '));
      return;
    }

    if (rows.length === 0) {
      setUploadError('CSV file contains no data rows.');
      return;
    }

    setMappingHeaders(headers);
    setMappingRows(rows);
    setMappingFileName(file.name);
    setIsMappingModalOpen(true);
  };

  const handleConfirmMapping = (records: CompanyRecord[], corrections: string[]) => {
    if (corrections && corrections.length > 0) {
      setAutoCorrections(corrections);
    }
    if (records.length > 0) {
      onRecordsUploaded(records);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await processFile(file);
    }
  };

  const handleDownloadTemplate = () => {
    const sampleCsv = generateSampleCSVString();
    downloadCSV(sampleCsv, 'irish_companies_template.csv');
  };

  // Google Drive Sheet import handlers
  const handleOpenDriveModal = async () => {
    if (!accessToken) {
      onGoogleSignIn();
      return;
    }

    setShowDriveModal(true);
    setDriveError(null);
    setIsLoadingDriveFiles(true);

    try {
      const files = await listUserGoogleSheets(accessToken);
      setDriveFiles(files);
    } catch (err: any) {
      console.error('Failed to list Google Sheets:', err);
      setDriveError(err.message || 'Failed to list spreadsheets from Google Drive.');
      if (err instanceof GoogleAuthExpiredError) {
        setShowDriveModal(false);
        onGoogleSignIn();
      }
    } finally {
      setIsLoadingDriveFiles(false);
    }
  };

  const handleSelectDriveSheet = async (file: DriveFileItem) => {
    if (!accessToken) return;
    setIsImportingSheet(true);
    setDriveError(null);
    setAutoCorrections([]);

    try {
      const { records, autoCorrections: corrections } = await importLeadsFromGoogleSheet(accessToken, file.id);
      if (corrections && corrections.length > 0) {
        setAutoCorrections(corrections);
      }
      onRecordsUploaded(records);
      setFileName(`Google Sheet: ${file.name}`);
      setShowDriveModal(false);
    } catch (err: any) {
      console.error('Sheet import failed:', err);
      setDriveError(err.message || 'Failed to import records from selected Google Sheet.');
      if (err instanceof GoogleAuthExpiredError) {
        setShowDriveModal(false);
        onGoogleSignIn();
      }
    } finally {
      setIsImportingSheet(false);
    }
  };

  return (
    <div className="bg-char rounded-2xl border border-char-light p-5 mb-6 font-body">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 mb-4 border-b border-char-light gap-2">
        <div>
          <h2 className="font-display text-base font-semibold text-ash flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-gold" />
            1. Import Irish Business Dataset
          </h2>
          <p className="text-xs text-smoke mt-0.5">
            Upload a CSV file or import directly from <span className="font-semibold text-gold">Google Drive & Sheets</span>.
          </p>
        </div>

        <div className="flex items-center space-x-2 flex-wrap gap-y-1">
          {mappingHeaders.length > 0 && (
            <button
              type="button"
              onClick={() => setIsMappingModalOpen(true)}
              className="inline-flex items-center px-2.5 py-1.5 text-xs font-semibold text-ash bg-void/60 hover:bg-void border border-char-light rounded-full transition-colors"
            >
              <Layers className="w-3.5 h-3.5 mr-1 text-gold" />
              Map Columns
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowSingleSearch(!showSingleSearch)}
            className="inline-flex items-center px-2.5 py-1.5 text-xs font-semibold text-ash bg-void/60 hover:bg-void border border-char-light rounded-full transition-colors"
          >
            <Plus className="w-3.5 h-3.5 mr-1 text-gold" />
            Add Single Search
          </button>
          <button
            type="button"
            onClick={handleOpenDriveModal}
            className="inline-flex items-center px-2.5 py-1.5 text-xs font-semibold text-ash bg-void/60 hover:bg-void border border-char-light rounded-full transition-colors"
          >
            <svg className="w-3.5 h-3.5 mr-1.5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            Import from Google Sheets
          </button>
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="inline-flex items-center px-2.5 py-1.5 text-xs font-medium text-smoke bg-void/60 hover:bg-void rounded-full transition-colors"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            CSV Template
          </button>
          <button
            type="button"
            onClick={() => setShowFormatGuide(!showFormatGuide)}
            className="inline-flex items-center px-2 py-1.5 text-xs font-medium text-smoke hover:text-ash transition-colors"
          >
            <Info className="w-3.5 h-3.5 mr-1" />
            Format Guide
          </button>
        </div>
      </div>

      {/* Single Business Quick Search Form */}
      {showSingleSearch && (
        <form onSubmit={handleAddSingleBusiness} className="mb-4 p-4 bg-void/60 border border-char-light rounded-xl space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-ash uppercase tracking-wider flex items-center gap-1.5">
              <Search className="w-4 h-4 text-gold" /> Quick Add & Research Single Irish Business
            </h3>
            <button
              type="button"
              onClick={() => setShowSingleSearch(false)}
              className="text-smoke hover:text-ash p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-smoke mb-1">
                Company / Business Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Kerry Group or Dairygold"
                value={singleName}
                onChange={(e) => setSingleName(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-void border border-char-light text-ash rounded-lg focus:ring-2 focus:ring-gold/40 focus:border-gold/50 font-medium"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-smoke mb-1">
                Target County (Ireland)
              </label>
              <input
                type="text"
                placeholder="e.g. Kerry, Cork, Dublin"
                value={singleCounty}
                onChange={(e) => setSingleCounty(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-void border border-char-light text-ash rounded-lg focus:ring-2 focus:ring-gold/40 focus:border-gold/50 font-medium"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-smoke mb-1">
                CRO Reg Number (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. 206631"
                value={singleCro}
                onChange={(e) => setSingleCro(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-void border border-char-light text-ash rounded-lg focus:ring-2 focus:ring-gold/40 focus:border-gold/50 font-medium"
              />
            </div>
          </div>
          <div className="flex justify-end pt-1">
            <button
              type="submit"
              className="inline-flex items-center px-4 py-2 text-xs font-bold text-void bg-gradient-to-r from-ember to-gold rounded-full transition-colors"
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Add Business & Queue for Research
            </button>
          </div>
        </form>
      )}

      {showFormatGuide && (
        <div className="mb-4 p-3.5 bg-void/60 border border-char-light rounded-lg text-xs text-smoke space-y-1.5">
          <p className="font-semibold text-ash">Expected Dataset Format Specification:</p>
          <ul className="list-disc pl-4 space-y-1 text-smoke">
            <li><strong className="text-ash">CompanyNumber / CRO</strong>: Registration Number (e.g., 308222)</li>
            <li><strong className="text-ash">CompanyName / Business</strong>: Registered Business Name (e.g., Glanbia PLC)</li>
            <li><strong className="text-ash">Address4 / County</strong>: Target County in Ireland (e.g., Kilkenny, Dublin, Cork, Galway)</li>
          </ul>
        </div>
      )}

      {/* Auto-Healing / Column Alignment Notification Banner */}
      {autoCorrections.length > 0 && (
        <div className="mb-4 p-3 bg-gold/10 border border-gold/30 rounded-xl text-xs text-ash space-y-1 animate-in fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-gold">
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>Smart Column Auto-Healing Engine Triggered</span>
            </div>
            <button
              type="button"
              onClick={() => setAutoCorrections([])}
              className="text-gold hover:text-ash p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {autoCorrections.map((msg, i) => (
            <p key={i} className="text-smoke font-medium pl-6 text-[11px]">
              {msg}
            </p>
          ))}
        </div>
      )}

      {/* Drag and Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative cursor-pointer border-2 border-dashed rounded-xl p-6 text-center transition-all ${
          isDragging
            ? 'border-gold bg-gold/5 scale-[1.005]'
            : 'border-char-light hover:border-smoke/50 bg-void/30 hover:bg-void/50'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          className="hidden"
        />

        <div className="flex flex-col items-center justify-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-ember to-gold text-void flex items-center justify-center">
            <Upload className="w-6 h-6" />
          </div>

          <div className="text-sm font-medium text-ash">
            {fileName ? (
              <span className="text-gold font-bold flex items-center gap-1.5">
                <Check className="w-4 h-4" /> Loaded: {fileName} ({currentCount} records)
              </span>
            ) : (
              <>
                <span className="text-gold font-semibold underline decoration-gold/40">Click to upload CSV</span> or drag and drop file here
              </>
            )}
          </div>

          <p className="text-xs text-smoke">
            Supports CSV files & Google Sheets datasets up to 10,000 rows.
          </p>

          <div className="pt-2 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onLoadSampleData();
              }}
              className="inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-full text-gold bg-gold/10 hover:bg-gold/20 border border-gold/30 transition-all"
            >
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              Load Sample Irish Companies (20)
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleOpenDriveModal();
              }}
              className="inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-full text-ash bg-void/60 hover:bg-void border border-char-light"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5 text-gold" />
              Google Drive Sheets
            </button>
          </div>
        </div>
      </div>

      {uploadError && (
        <div className="mt-3 p-3 bg-ember/10 border border-ember/30 rounded-lg flex items-center text-xs text-ember gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{uploadError}</span>
        </div>
      )}

      {/* Google Drive Import Modal */}
      {showDriveModal && (
        <div className="fixed inset-0 bg-void/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-char rounded-2xl max-w-lg w-full border border-char-light overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-5 py-4 border-b border-char-light flex items-center justify-between bg-void/40">
              <div className="flex items-center space-x-2">
                <FileSpreadsheet className="w-5 h-5 text-gold" />
                <h3 className="font-display font-semibold text-ash text-sm">Import from Google Drive Sheets</h3>
              </div>
              <button
                onClick={() => setShowDriveModal(false)}
                className="p-1 text-smoke hover:text-ash rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[400px] overflow-y-auto">
              {driveError && (
                <div className="p-3 bg-ember/10 border border-ember/30 text-ember rounded-lg text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{driveError}</span>
                </div>
              )}

              {isLoadingDriveFiles ? (
                <div className="py-12 text-center text-smoke space-y-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-gold mx-auto" />
                  <p className="text-xs font-medium">Fetching spreadsheets from your Google Drive...</p>
                </div>
              ) : driveFiles.length === 0 ? (
                <div className="py-8 text-center text-smoke space-y-2">
                  <p className="text-xs">No Google Sheets found in your Google Drive.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-smoke font-medium">Select a Google Sheet to import company records:</p>
                  <div className="divide-y divide-char-light border border-char-light rounded-xl overflow-hidden">
                    {driveFiles.map((file) => (
                      <button
                        key={file.id}
                        disabled={isImportingSheet}
                        onClick={() => handleSelectDriveSheet(file)}
                        className="w-full text-left p-3 hover:bg-void/60 transition-colors flex items-center justify-between group"
                      >
                        <div className="flex items-center space-x-3">
                          <FileSpreadsheet className="w-4 h-4 text-gold shrink-0" />
                          <div>
                            <div className="text-xs font-bold text-ash">{file.name}</div>
                            {file.modifiedTime && (
                              <div className="text-[10px] text-smoke">
                                Modified {new Date(file.modifiedTime).toLocaleDateString()}
                              </div>
                            )}
                          </div>
                        </div>
                        <span className="text-xs font-semibold text-gold opacity-0 group-hover:opacity-100 transition-opacity">
                          Import
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="px-5 py-3.5 bg-void/40 border-t border-char-light flex items-center justify-between text-xs text-smoke">
              <span>Connected with Google Workspace</span>
              <button
                onClick={() => setShowDriveModal(false)}
                className="px-3 py-1.5 font-medium text-ash hover:bg-void/60 rounded-lg"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dynamic Column Mapping Modal */}
      <ColumnMappingModal
        isOpen={isMappingModalOpen}
        onClose={() => setIsMappingModalOpen(false)}
        fileName={mappingFileName}
        headers={mappingHeaders}
        rows={mappingRows}
        onConfirmImport={handleConfirmMapping}
      />
    </div>
  );
};

