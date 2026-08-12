import React from 'react';
import { Search, ShieldCheck, Database, RefreshCw, Sparkles, Building2, LogOut, CheckCircle2, Save } from 'lucide-react';
import { User } from 'firebase/auth';

interface HeaderProps {
  hasApiKey: boolean;
  totalRecords: number;
  processedRecords: number;
  user: User | null;
  isLoggingIn: boolean;
  lastSavedAt?: string | null;
  onGoogleSignIn: () => void;
  onGoogleSignOut: () => void;
  onReset: () => void;
  onLoadSample: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  hasApiKey,
  totalRecords,
  processedRecords,
  user,
  isLoggingIn,
  lastSavedAt,
  onGoogleSignIn,
  onGoogleSignOut,
  onReset,
  onLoadSample,
}) => {
  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-30 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          {/* Logo & Branding */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center shadow-lg shadow-emerald-900/30 ring-1 ring-emerald-400/30">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-lg font-bold tracking-tight text-white">
                  Irish B2B Lead Enrichment
                </h1>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Stage 1 & 2 Active
                </span>
              </div>
              <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                <Search className="w-3 h-3 text-emerald-400" />
                Website & B2B Lead Research &bull; Google Drive & Sheets Sync
              </p>
            </div>
          </div>

          {/* Right Action Bar & Workspace OAuth */}
          <div className="flex items-center space-x-2.5 flex-wrap">
            {/* Google Drive / Sheets Auth Button */}
            {user ? (
              <div className="flex items-center space-x-2 bg-slate-800/90 border border-emerald-500/40 rounded-lg px-2.5 py-1 text-xs text-slate-200">
                {user.photoURL ? (
                  <img src={user.photoURL} alt={user.displayName || 'User'} className="w-5 h-5 rounded-full ring-1 ring-emerald-400" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                )}
                <span className="font-medium text-emerald-300 max-w-[120px] truncate">{user.displayName || user.email}</span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-500/30 font-semibold">Drive Connected</span>
                <button
                  onClick={onGoogleSignOut}
                  title="Sign out of Google"
                  className="p-1 hover:text-red-400 text-slate-400 rounded transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={onGoogleSignIn}
                disabled={isLoggingIn}
                className="inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-lg bg-white text-slate-800 hover:bg-slate-100 transition-colors shadow-sm ring-1 ring-slate-300"
              >
                <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                {isLoggingIn ? 'Connecting...' : 'Sign in with Google'}
              </button>
            )}

            {/* Auto-Save Persistence Badge */}
            <div
              className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-950/80 text-emerald-300 border border-emerald-800/80"
              title={lastSavedAt ? `Auto-saved to localStorage at ${lastSavedAt}` : 'Auto-save active'}
            >
              <Save className="w-3 h-3 mr-1 text-emerald-400" />
              <span className="hidden md:inline">Auto-Saved</span>
              {lastSavedAt && <span className="ml-1 font-mono text-[10px] text-emerald-400/90">{lastSavedAt}</span>}
            </div>

            {/* API Key Status Badge */}
            <div
              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${
                hasApiKey
                  ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800/80'
                  : 'bg-amber-950/80 text-amber-300 border-amber-800/80'
              }`}
              title={hasApiKey ? 'Gemini API Connected with Google Search Grounding' : 'Checking Gemini API...'}
            >
              <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${hasApiKey ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <Sparkles className="w-3 h-3 mr-1" />
              {hasApiKey ? 'Grounding Ready' : 'API Connecting...'}
            </div>

            {/* Load Sample Button */}
            <button
              onClick={onLoadSample}
              className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors shadow-sm"
            >
              <Database className="w-3.5 h-3.5 mr-1.5 text-teal-400" />
              Sample Data
            </button>

            {/* Clear/Reset Button */}
            {totalRecords > 0 && (
              <button
                onClick={onReset}
                className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 transition-colors"
                title="Reset session & clear list"
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
                Reset
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

