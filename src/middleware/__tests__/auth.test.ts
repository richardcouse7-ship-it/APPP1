import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { requireAuth, isUnauthenticatedAccessAllowed } from "../auth";

// These tests run with no FIREBASE_SERVICE_ACCOUNT / FIREBASE_PROJECT_ID set
// (the default test environment), so auth.ts's module-level init leaves
// authEnabled=false — exactly the "unconfigured" state the fail-closed
// logic under test is meant to guard.

function makeRes() {
  const res: any = {
    statusCode: undefined,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

describe("isUnauthenticatedAccessAllowed", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalOverride = process.env.ALLOW_UNSAFE_NO_AUTH;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.ALLOW_UNSAFE_NO_AUTH = originalOverride;
  });

  it("allows unauthenticated access outside production", () => {
    process.env.NODE_ENV = "development";
    delete process.env.ALLOW_UNSAFE_NO_AUTH;
    expect(isUnauthenticatedAccessAllowed()).toBe(true);
  });

  it("allows unauthenticated access in test env", () => {
    process.env.NODE_ENV = "test";
    delete process.env.ALLOW_UNSAFE_NO_AUTH;
    expect(isUnauthenticatedAccessAllowed()).toBe(true);
  });

  it("fails closed in production when unconfigured", () => {
    process.env.NODE_ENV = "production";
    delete process.env.ALLOW_UNSAFE_NO_AUTH;
    expect(isUnauthenticatedAccessAllowed()).toBe(false);
  });

  it("respects the explicit unsafe override in production", () => {
    process.env.NODE_ENV = "production";
    process.env.ALLOW_UNSAFE_NO_AUTH = "true";
    expect(isUnauthenticatedAccessAllowed()).toBe(true);
  });

  it("does not treat truthy-but-not-'true' values as an override", () => {
    process.env.NODE_ENV = "production";
    process.env.ALLOW_UNSAFE_NO_AUTH = "1";
    expect(isUnauthenticatedAccessAllowed()).toBe(false);
  });
});

describe("requireAuth (unconfigured auth)", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalOverride = process.env.ALLOW_UNSAFE_NO_AUTH;

  beforeEach(() => {
    delete process.env.ALLOW_UNSAFE_NO_AUTH;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.ALLOW_UNSAFE_NO_AUTH = originalOverride;
  });

  it("calls next() outside production", async () => {
    process.env.NODE_ENV = "development";
    const next = vi.fn();
    const res = makeRes();
    await requireAuth({ headers: {} } as any, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBeUndefined();
  });

  it("blocks with 503 in production", async () => {
    process.env.NODE_ENV = "production";
    const next = vi.fn();
    const res = makeRes();
    await requireAuth({ headers: {} } as any, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(503);
    expect(res.body.error).toMatch(/not configured/i);
  });

  it("calls next() in production when ALLOW_UNSAFE_NO_AUTH=true", async () => {
    process.env.NODE_ENV = "production";
    process.env.ALLOW_UNSAFE_NO_AUTH = "true";
    const next = vi.fn();
    const res = makeRes();
    await requireAuth({ headers: {} } as any, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBeUndefined();
  });
});
