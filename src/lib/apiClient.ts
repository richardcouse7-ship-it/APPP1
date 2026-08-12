import { auth } from "./firebaseAuth";

/**
 * Frontend API client that automatically attaches the Firebase ID token
 * to all requests for server-side authentication.
 *
 * In dev mode (server without firebase-admin), the token is sent but
 * not verified — the server allows all requests.
 */

/**
 * Returns the current user's Firebase ID token, or null if not signed in.
 * The token is short-lived (~1hr) and auto-refreshed by the Firebase SDK.
 */
async function getAuthToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken();
  } catch {
    return null;
  }
}

/**
 * Wrapper around fetch() that attaches the Firebase auth token
 * and sets JSON content-type automatically.
 *
 * Use this instead of raw fetch() for all /api/* calls.
 */
export async function apiFetch(
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  return fetch(url, { ...init, headers });
}
