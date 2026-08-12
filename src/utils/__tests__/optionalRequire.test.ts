import { describe, it, expect } from "vitest";
import { getOptionalRequire } from "../optionalRequire";

// Note: this only exercises the functional contract (you get back a working
// require). It can't reliably force the native-require-vs-createRequire
// branch from inside Vitest — vite-node executes every module through a
// CJS-style wrapper that injects its own `require`, so both branches
// observe a defined `require` here regardless of globalThis mutation. The
// two real branches (tsx real-ESM in dev, esbuild CJS bundle in prod) are
// instead verified by actually booting the dev server and dist/server.cjs.
describe("getOptionalRequire", () => {
  it("returns a require function that can load a Node builtin", () => {
    const req = getOptionalRequire(import.meta.url);
    expect(typeof req).toBe("function");
    expect(req("node:path").sep).toBeDefined();
  });
});
