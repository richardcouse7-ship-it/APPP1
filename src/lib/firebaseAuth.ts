import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User, signOut } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
];

const provider = new GoogleAuthProvider();
WORKSPACE_SCOPES.forEach((scope) => provider.addScope(scope));

const TOKEN_KEY = 'workspace_google_access_token';
const TOKEN_EXPIRY_KEY = 'workspace_google_access_token_expiry';

// Firebase's popup credential doesn't expose the real expires_in, so assume
// Google's standard 1hr access token lifetime with a safety margin.
const DEFAULT_TOKEN_TTL_MS = 55 * 60 * 1000;
const EXPIRY_REFRESH_BUFFER_MS = 5 * 60 * 1000;

let cachedAccessToken: string | null = (() => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
})();

let cachedTokenExpiry: number | null = (() => {
  try {
    const stored = localStorage.getItem(TOKEN_EXPIRY_KEY);
    return stored ? Number(stored) : null;
  } catch {
    return null;
  }
})();

const setCachedToken = (token: string, expiresInSec: number = DEFAULT_TOKEN_TTL_MS / 1000) => {
  cachedAccessToken = token;
  cachedTokenExpiry = Date.now() + expiresInSec * 1000;
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(TOKEN_EXPIRY_KEY, String(cachedTokenExpiry));
  } catch (e) {
    console.warn('Could not save access token to localStorage', e);
  }
};

const clearCachedToken = () => {
  cachedAccessToken = null;
  cachedTokenExpiry = null;
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_EXPIRY_KEY);
  } catch {}
};

let gisLoadPromise: Promise<void> | null = null;

const loadGoogleIdentityServices = (): Promise<void> => {
  if ((window as any).google?.accounts?.oauth2) return Promise.resolve();
  if (gisLoadPromise) return gisLoadPromise;

  gisLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services script.'));
    document.head.appendChild(script);
  });

  return gisLoadPromise;
};

let tokenClient: any = null;
let pendingTokenResolve: ((token: string | null) => void) | null = null;

const getTokenClient = async () => {
  await loadGoogleIdentityServices();
  if (!tokenClient) {
    tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
      client_id: (firebaseConfig as any).oAuthClientId,
      scope: WORKSPACE_SCOPES.join(' '),
      callback: (response: any) => {
        if (response?.access_token) {
          setCachedToken(response.access_token, response.expires_in);
          pendingTokenResolve?.(response.access_token);
        } else {
          pendingTokenResolve?.(null);
        }
        pendingTokenResolve = null;
      },
      error_callback: () => {
        pendingTokenResolve?.(null);
        pendingTokenResolve = null;
      },
    });
  }
  return tokenClient;
};

let refreshInFlight: Promise<string | null> | null = null;

/**
 * Requests a fresh Google Workspace access token via Google Identity Services,
 * independent of Firebase's own (auto-refreshing) sign-in session. `interactive`
 * shows a consent/account picker; otherwise attempts a silent (no-popup) refresh,
 * which succeeds only if the user already granted these scopes.
 */
export const refreshAccessToken = (interactive = false): Promise<string | null> => {
  if (!auth.currentUser) return Promise.resolve(null);
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const client = await getTokenClient();
      return await new Promise<string | null>((resolve) => {
        pendingTokenResolve = resolve;
        client.requestAccessToken({ prompt: interactive ? 'consent' : '' });
      });
    } catch (e) {
      console.warn('Google Workspace token refresh failed:', e);
      return null;
    }
  })().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
};

/**
 * Returns a Workspace access token guaranteed not to be near expiry, silently
 * refreshing it first if needed. Call this immediately before any Drive/Sheets
 * API request instead of reading the cached token directly.
 */
export const getValidAccessToken = async (): Promise<string | null> => {
  const token = cachedAccessToken || localStorage.getItem(TOKEN_KEY);
  const expiry = cachedTokenExpiry ?? Number(localStorage.getItem(TOKEN_EXPIRY_KEY) || 0);

  if (token && expiry && Date.now() < expiry - EXPIRY_REFRESH_BUFFER_MS) {
    return token;
  }

  return refreshAccessToken(false);
};

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      const storedToken = cachedAccessToken || localStorage.getItem(TOKEN_KEY);
      if (storedToken) {
        cachedAccessToken = storedToken;
        if (onAuthSuccess) onAuthSuccess(user, storedToken);
      } else {
        // User is authenticated in Firebase; if token expired/cleared, pass user with empty token or request re-auth when accessing Drive
        if (onAuthSuccess) onAuthSuccess(user, '');
      }
    } else {
      clearCachedToken();
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to retrieve access token from Google sign-in.');
    }

    setCachedToken(credential.accessToken);

    return { user: result.user, accessToken: credential.accessToken };
  } catch (error: any) {
    console.error('Sign in error:', error);
    throw error;
  }
};

export const getAccessToken = (): string | null => {
  return cachedAccessToken || localStorage.getItem(TOKEN_KEY);
};

export const logoutUser = async () => {
  await signOut(auth);
  clearCachedToken();
};
