import React from 'react';
import { Search, Database, RefreshCw, Sparkles, LogOut, CheckCircle2, Save } from 'lucide-react';
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
    <header className="relative sticky top-0 z-30 bg-void/90 backdrop-blur-md border-b border-char-light/80 shadow-lg overflow-hidden">
      {/* Ambient ember wave — signature motion in the UI */}
      <div
        className="absolute inset-0 opacity-20 animate-ember-wave pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(115deg, var(--color-ember) 0%, var(--color-gold) 25%, transparent 50%, var(--color-ember) 75%, var(--color-gold) 100%)',
        }}
      />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          {/* Wordmark */}
          <div className="flex items-center space-x-2.5">
            <h1 className="font-display text-base sm:text-lg font-bold tracking-tight text-ash drop-shadow-sm">
              Irish B2B Lead Enrichment
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-char/90 text-gold border border-gold/40 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse" />
              Live
            </span>
            <p className="hidden lg:flex items-center gap-1.5 text-xs text-smoke/90 font-body">
              <Search className="w-3.5 h-3.5 text-ember" />
              Website & B2B Lead Research
            </p>
          </div>

          {/* Right Action Bar */}
          <div className="flex items-center gap-2 flex-wrap">
            {user ? (
              <div className="flex items-center gap-2 bg-char/80 border border-char-light rounded-full pl-2 pr-1 py-1 text-xs text-ash font-body shadow-sm">
                {user.photoURL ? (
                  <img src={user.photoURL} alt={user.displayName || 'User'} className="w-5 h-5 rounded-full ring-1 ring-gold/50" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-gold" />
                )}
                <span className="font-medium max-w-[120px] truncate">{user.displayName || user.email}</span>
                <button
                  onClick={onGoogleSignOut}
                  title="Sign out of Google"
                  className="p-1.5 hover:text-ember text-smoke rounded-full transition-colors cursor-pointer hover:bg-char-light/50"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={onGoogleSignIn}
                disabled={isLoggingIn}
                className="inline-flex items-center px-3.5 py-1.5 text-xs font-semibold rounded-full bg-ash text-void hover:bg-white hover:shadow-md active:scale-95 transition-all cursor-pointer font-body"
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

            {/* Auto-Save Badge */}
            <div
              className="hidden md:inline-flex items-center px-3 py-1 rounded-full text-[11px] font-medium font-body bg-char/80 text-smoke border border-char-light/80 shadow-sm"
              title={lastSavedAt ? `Auto-saved to localStorage at ${lastSavedAt}` : 'Auto-save active'}
            >
              <Save className="w-3 h-3 mr-1.5 text-gold" />
              Auto-Saved
              {lastSavedAt && <span className="ml-1.5 font-mono text-[10px] text-smoke/90">{lastSavedAt}</span>}
            </div>

            {/* API Key Status Badge */}
            <div
              className={`inline-flex items-center px-3 py-1 rounded-full text-[11px] font-medium font-body border shadow-sm ${
                hasApiKey ? 'bg-char/90 text-gold border-gold/30' : 'bg-char/90 text-ember border-ember/40'
              }`}
              title={hasApiKey ? 'Gemini API Connected with Google Search Grounding' : 'Checking Gemini API...'}
            >
              <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${hasApiKey ? 'bg-gold animate-pulse' : 'bg-ember'}`} />
              <Sparkles className="w-3 h-3 mr-1" />
              {hasApiKey ? 'Grounding Ready' : 'API Connecting...'}
            </div>

            {/* Load Sample */}
            <button
              onClick={onLoadSample}
              className="inline-flex items-center px-3.5 py-1.5 text-xs font-semibold font-body rounded-full text-ash bg-char/80 hover:bg-char border border-char-light/80 hover:border-gold/30 active:scale-95 transition-all cursor-pointer shadow-sm"
            >
              <Database className="w-3.5 h-3.5 mr-1.5 text-gold" />
              Sample Data
            </button>

            {/* Reset */}
            {totalRecords > 0 && (
              <button
                onClick={onReset}
                className="inline-flex items-center px-3.5 py-1.5 text-xs font-semibold font-body rounded-full text-smoke hover:text-ash bg-char/50 hover:bg-char border border-char-light/60 hover:border-ember/30 active:scale-95 transition-all cursor-pointer shadow-sm"
                title="Reset session & clear list"
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                Reset
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
