/**
 * Server-side enrichment cache with dual-layer persistence.
 *
 * L1: In-memory Map (fast, process-local)
 * L2: Firestore via firebase-admin (persistent across restarts)
 *
 * L2 is opt-in via ENABLE_FIRESTORE_L2=true (matches the strictness of
 * ALLOW_UNSAFE_NO_AUTH in auth.ts — only the literal string "true" turns it
 * on). This has never run in a built production bundle before: the
 * require(import.meta.url) pattern it used threw under esbuild's CJS
 * output, so the constructor always failed and L2 silently never
 * initialized. Now that the crash is fixed (getOptionalRequire), L2 would
 * start making real Firestore reads/writes in production for the first
 * time, with unmeasured quota/cost/latency impact — so it defaults off
 * until that's been evaluated. When off, no firebase-admin require and no
 * credential lookup happen at all; L1 in-memory behaves exactly as before.
 */

import { getOptionalRequire } from "../utils/optionalRequire";

const L1_CACHE = new Map<string, { value: any; expiresAt: number }>();

// Cache TTL: 7 days
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Max L1 entries to prevent unbounded memory growth
const MAX_L1_ENTRIES = 5000;

export function isFirestoreL2Enabled(): boolean {
  return process.env.ENABLE_FIRESTORE_L2 === "true";
}

let adminDb: any = null;

if (!isFirestoreL2Enabled()) {
  console.log("[CACHE] Firestore L2 disabled (ENABLE_FIRESTORE_L2 not set to \"true\"). Running L1 (in-memory) only.");
} else {
  try {
    const localRequire = getOptionalRequire(import.meta.url);
    const admin = localRequire("firebase-admin");

    // Reuse the same app instance if already initialized by auth middleware
    const appName = "irish-b2b-cache";
    try {
      admin.app(appName);
      adminDb = admin.app(appName).firestore();
    } catch {
      // App not yet initialized — check if the default app exists
      try {
        const defaultApp = admin.app();
        adminDb = defaultApp.firestore();
      } catch {
        // No admin app initialized — cache runs in L1-only mode
      }
    }

    if (adminDb) {
      console.log("[CACHE] Firestore L2 cache ENABLED and initialized (ENABLE_FIRESTORE_L2=true).");
    } else {
      console.warn("[CACHE] ENABLE_FIRESTORE_L2=true but no Firebase Admin app found. Running L1 (in-memory) only.");
    }
  } catch (err: any) {
    if (err.code === "MODULE_NOT_FOUND") {
      console.warn("[CACHE] ENABLE_FIRESTORE_L2=true but firebase-admin not installed. Running L1 (in-memory) only.");
    } else {
      console.warn("[CACHE] ENABLE_FIRESTORE_L2=true but Firestore L2 init failed:", err.message);
    }
  }
}

const CACHE_COLLECTION = "enrichmentCache";

/**
 * Retrieves a cached enrichment result.
 * Checks L1 first, then L2 (Firestore). L2 hits are promoted to L1.
 */
export async function getCachedEnrichment(cacheKey: string): Promise<any | null> {
  // L1 check
  const l1Entry = L1_CACHE.get(cacheKey);
  if (l1Entry) {
    if (Date.now() < l1Entry.expiresAt) {
      return { ...l1Entry.value, fromCache: true };
    }
    L1_CACHE.delete(cacheKey);
  }

  // L2 check (Firestore)
  if (adminDb) {
    try {
      const docRef = adminDb.collection(CACHE_COLLECTION).doc(cacheKey);
      const docSnap = await docRef.get();
      if (docSnap.exists) {
        const data = docSnap.data();
        // Check TTL
        if (data.cachedAt && Date.now() - data.cachedAt < CACHE_TTL_MS) {
          // Promote to L1
          promoteToL1(cacheKey, data.result);
          return { ...data.result, fromCache: true };
        }
      }
    } catch (err: any) {
      console.warn(`[CACHE] L2 read failed for key "${cacheKey}":`, err.message);
    }
  }

  return null;
}

/**
 * Stores an enrichment result in both L1 and L2.
 */
export async function setCachedEnrichment(cacheKey: string, result: any): Promise<void> {
  // L1 set
  promoteToL1(cacheKey, result);

  // L2 set (Firestore) — fire and forget, don't block enrichment response
  if (adminDb) {
    try {
      const docRef = adminDb.collection(CACHE_COLLECTION).doc(cacheKey);
      await docRef.set({
        result,
        cachedAt: Date.now(),
        cacheKey,
      });
    } catch (err: any) {
      console.warn(`[CACHE] L2 write failed for key "${cacheKey}":`, err.message);
    }
  }
}

/**
 * Stores a value in L1 with eviction if over capacity.
 */
function promoteToL1(cacheKey: string, value: any): void {
  // Evict oldest entries if at capacity
  if (L1_CACHE.size >= MAX_L1_ENTRIES) {
    const oldestKey = L1_CACHE.keys().next().value;
    if (oldestKey) L1_CACHE.delete(oldestKey);
  }

  L1_CACHE.set(cacheKey, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

/**
 * Clears all L1 cache entries (useful for testing).
 */
export function clearL1Cache(): void {
  L1_CACHE.clear();
}
