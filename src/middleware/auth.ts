import { Request, Response, NextFunction } from "express";
import { getOptionalRequire } from "../utils/optionalRequire";

const require = getOptionalRequire(import.meta.url);

/**
 * Firebase Admin Auth middleware.
 *
 * Verifies Firebase ID tokens sent as Bearer tokens from the client.
 * Falls back to "dev mode" (allow all with warning) when no service account
 * is configured — so local development works without Firebase Admin setup.
 *
 * Production deployments MUST set FIREBASE_SERVICE_ACCOUNT or run in an
 * environment with Application Default Credentials (Google Cloud). If
 * neither is set, requests are FAILED CLOSED (503) in production — see
 * isUnauthenticatedAccessAllowed() — rather than silently allowed through.
 */

let adminApp: any = null;
let authEnabled = false;

try {
  // firebase-admin is a peer dependency — loaded dynamically so the app
  // still starts if the package is not installed (dev mode).
  const admin = require("firebase-admin");

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  const projectId = process.env.FIREBASE_PROJECT_ID;

  if (serviceAccountJson) {
    const serviceAccount = JSON.parse(serviceAccountJson);
    adminApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id || projectId,
    });
    authEnabled = true;
    console.log("[AUTH] Firebase Admin initialized with service account.");
  } else if (projectId) {
    // Use Application Default Credentials (Google Cloud, AI Studio, etc.)
    adminApp = admin.initializeApp({ projectId });
    authEnabled = true;
    console.log("[AUTH] Firebase Admin initialized with default credentials.");
  } else {
    console.warn("[AUTH] No Firebase Admin credentials configured. Running in UNAUTHENTICATED dev mode.");
    console.warn("[AUTH] Set FIREBASE_SERVICE_ACCOUNT or FIREBASE_PROJECT_ID to enable token verification.");
  }
} catch (err: any) {
  if (err.code === "MODULE_NOT_FOUND") {
    console.warn("[AUTH] firebase-admin not installed. Running in UNAUTHENTICATED dev mode.");
    console.warn("[AUTH] Install with: npm install firebase-admin");
  } else {
    console.error("[AUTH] Failed to initialize Firebase Admin:", err.message);
  }
}

/**
 * Whether requests should be allowed through when Firebase Admin isn't
 * configured (no service account / project credentials found).
 *
 * Fails CLOSED in production: an unconfigured auth layer in production is a
 * misconfiguration, not a valid "public API" state, so requests are blocked
 * (503) rather than silently allowed. Set ALLOW_UNSAFE_NO_AUTH=true to
 * explicitly opt back into allow-all (e.g. a staging deploy that
 * intentionally has no auth yet) — this must be a deliberate, visible choice.
 *
 * Non-production environments keep the original allow-all dev-mode
 * behavior so local development works without any Firebase setup.
 */
export function isUnauthenticatedAccessAllowed(): boolean {
  const isProduction = process.env.NODE_ENV === "production";
  if (!isProduction) return true;
  return process.env.ALLOW_UNSAFE_NO_AUTH === "true";
}

/**
 * Express middleware that verifies the Firebase ID token from the
 * Authorization header. Skips verification in dev mode (when admin SDK
 * is not initialized) — unless production fail-closed rules apply.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!authEnabled || !adminApp) {
    if (isUnauthenticatedAccessAllowed()) {
      return next();
    }
    console.error("[AUTH] Blocking request: auth not configured in production and ALLOW_UNSAFE_NO_AUTH is not set.");
    res.status(503).json({
      error: "Authentication is not configured on this server. Set FIREBASE_SERVICE_ACCOUNT or FIREBASE_PROJECT_ID.",
    });
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required. Sign in with Google to continue." });
    return;
  }

  const idToken = authHeader.split("Bearer ")[1];
  try {
    const admin = require("firebase-admin");
    const decodedToken = await admin.auth(adminApp).verifyIdToken(idToken);
    // Attach the decoded UID for downstream use
    (req as any).userUid = decodedToken.uid;
    (req as any).userEmail = decodedToken.email;
    next();
  } catch (err: any) {
    console.error("[AUTH] Token verification failed:", err.message);
    res.status(403).json({ error: "Invalid or expired authentication token. Please sign in again." });
  }
}

/**
 * Lightweight auth check that does NOT block the request — used for
 * endpoints where auth is optional (e.g., health check can reveal more
 * info to authenticated users).
 */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (!authEnabled || !adminApp) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    try {
      const idToken = authHeader.split("Bearer ")[1];
      const admin = require("firebase-admin");
      const decodedToken = await admin.auth(adminApp).verifyIdToken(idToken);
      (req as any).userUid = decodedToken.uid;
      (req as any).userEmail = decodedToken.email;
    } catch {
      // Token invalid — continue without auth context
    }
  }
  next();
}
