import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// serverCache.ts decides whether to attempt Firestore L2 initialization at
// *module load* time, based on ENABLE_FIRESTORE_L2. To exercise both branches
// we have to reset the module registry and re-import fresh for each env
// combination — importing once at the top of the file would only ever
// observe whichever value was set first.

const MODULE_PATH = "../serverCache";

async function importFresh() {
  vi.resetModules();
  return await import(MODULE_PATH);
}

describe("isFirestoreL2Enabled", () => {
  const original = process.env.ENABLE_FIRESTORE_L2;

  afterEach(() => {
    if (original === undefined) delete process.env.ENABLE_FIRESTORE_L2;
    else process.env.ENABLE_FIRESTORE_L2 = original;
  });

  it("is off when unset", async () => {
    delete process.env.ENABLE_FIRESTORE_L2;
    const { isFirestoreL2Enabled } = await importFresh();
    expect(isFirestoreL2Enabled()).toBe(false);
  });

  it("is on only for the literal string 'true'", async () => {
    process.env.ENABLE_FIRESTORE_L2 = "true";
    const { isFirestoreL2Enabled } = await importFresh();
    expect(isFirestoreL2Enabled()).toBe(true);
  });

  it.each(["1", "TRUE", ""])("treats near-miss value %j as off", async (value) => {
    process.env.ENABLE_FIRESTORE_L2 = value;
    const { isFirestoreL2Enabled } = await importFresh();
    expect(isFirestoreL2Enabled()).toBe(false);
  });
});

describe("serverCache L2 gating", () => {
  const originalFlag = process.env.ENABLE_FIRESTORE_L2;
  const originalServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  const originalProjectId = process.env.FIREBASE_PROJECT_ID;

  beforeEach(() => {
    // No credentials in either case — isolates the flag as the only variable.
    delete process.env.FIREBASE_SERVICE_ACCOUNT;
    delete process.env.FIREBASE_PROJECT_ID;
  });

  afterEach(() => {
    if (originalFlag === undefined) delete process.env.ENABLE_FIRESTORE_L2;
    else process.env.ENABLE_FIRESTORE_L2 = originalFlag;
    if (originalServiceAccount === undefined) delete process.env.FIREBASE_SERVICE_ACCOUNT;
    else process.env.FIREBASE_SERVICE_ACCOUNT = originalServiceAccount;
    if (originalProjectId === undefined) delete process.env.FIREBASE_PROJECT_ID;
    else process.env.FIREBASE_PROJECT_ID = originalProjectId;
    vi.restoreAllMocks();
  });

  it("flag unset: never attempts Firestore init, L1 still serves and stores", async () => {
    delete process.env.ENABLE_FIRESTORE_L2;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { getCachedEnrichment, setCachedEnrichment, clearL1Cache } = await importFresh();

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Firestore L2 disabled"));
    // Only the L2-init warnings should be absent — nothing about Firestore
    // should have been attempted or failed.
    expect(warnSpy).not.toHaveBeenCalled();

    clearL1Cache();
    await setCachedEnrichment("key-1", { website: "example.ie" });
    const result = await getCachedEnrichment("key-1");
    expect(result).toMatchObject({ website: "example.ie", fromCache: true });
  });

  it("flag true, credentials unavailable: warns and degrades to L1 without throwing", async () => {
    process.env.ENABLE_FIRESTORE_L2 = "true";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const mod = await importFresh();
    const { getCachedEnrichment, setCachedEnrichment, clearL1Cache } = mod;

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("ENABLE_FIRESTORE_L2=true but no Firebase Admin app found")
    );

    clearL1Cache();
    await expect(setCachedEnrichment("key-2", { website: "example.ie" })).resolves.not.toThrow();
    const result = await getCachedEnrichment("key-2");
    expect(result).toMatchObject({ website: "example.ie", fromCache: true });
  });
});
