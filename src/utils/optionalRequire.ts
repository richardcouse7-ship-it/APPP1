import { createRequire } from "module";

/**
 * Returns a CommonJS `require` usable to dynamically load optional peer
 * dependencies (firebase-admin, ioredis) from both runtime shapes this
 * codebase ships as:
 *
 * - Dev: server.ts runs as real ESM via tsx. There is no native `require`
 *   global, so one must be built from `import.meta.url`.
 * - Prod: server.ts is bundled to CommonJS by esbuild (`--format=cjs`) for
 *   dist/server.cjs. esbuild empties out `import.meta.url` for CJS targets
 *   (it has no meaning there), so `createRequire(import.meta.url)` throws
 *   `ERR_INVALID_ARG_VALUE` at boot — but a real CJS module already has its
 *   own native `require`, so use that instead of constructing one.
 *
 * Always pass `import.meta.url` from the call site even though it's only
 * used on the ESM path — evaluating it is harmless (yields undefined under
 * the CJS bundle) since it's only read, never passed to createRequire,
 * once the native-require branch is taken.
 */
export function getOptionalRequire(importMetaUrl: string): NodeRequire {
  if (typeof require !== "undefined") {
    return require;
  }
  return createRequire(importMetaUrl);
}
