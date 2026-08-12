# Security Notes

## 2026-08-12 — npm audit: `uuid` (moderate) via `firebase-admin`, not `ioredis`

**Correction to task premise:** the launch-blocker brief for this audit attributed
the 8 moderate `npm audit` findings to `ioredis@^6.0.0`. That's not what's in
this repo or what `npm audit` reports:

- `package.json` pins `ioredis@^5.11.1` (there is no `^6.0.0` dependency here).
- `npm ls ioredis` and `npm audit --json` both confirm **zero** findings
  trace to `ioredis` at any version currently installed.
- All 8 findings trace to a single transitive advisory —
  [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq)
  ("uuid: Missing buffer bounds check in v3/v5/v6 when `buf` is provided",
  CVSS 7.5, affects `uuid <11.1.1`) — pulled in transitively via
  `firebase-admin` → `@google-cloud/firestore` / `@google-cloud/storage` →
  `google-gax` / `gaxios` / `teeny-request`. Full chain:
  `firebase-admin@13.10.0` → `@google-cloud/firestore@7.11.6` /
  `@google-cloud/storage@7.22.0` → `google-gax@4.6.1` → `uuid@9.0.1`.

**Why this isn't being fixed as part of this launch:**

- `npm audit fix --force` reports the only available fix bumps
  `firebase-admin` to `14.2.0`, a semver-major, breaking-change upgrade of a
  dependency this app's entire auth model (`isAuthEnabled()` /
  `requireAuth`, fail-closed in production) depends on. Per this task's
  explicit constraint, `npm audit fix --force` was not run, and an unscoped
  breaking upgrade to the auth stack days before launch was judged higher
  risk than the vulnerability itself.
- The vulnerable code path (`uuid` v3/v5/v6 generation with an
  attacker-influenced `buf` argument) is exercised only inside the Google
  Cloud SDK's own internals (`gaxios`/`google-gax`/`teeny-request`) — this
  app never calls `uuid` directly, and nothing in this codebase passes
  request-controlled data into that parameter. Practical exploitability
  against this app is effectively nil.
- This is unrelated to `ioredis` / the rate-limit subsystem, so it doesn't
  block or change the Redis decision below.

**Disposition:** accepted risk for this launch. Upgrading `firebase-admin`
to clear this advisory should be scheduled as its own follow-up (with a
full auth regression pass), not bundled into this launch.

## 2026-08-12 — Redis-backed rate limiting: deferred, in-memory is the launch backend

The rate limiter (`src/middleware/rateLimiter.ts`) supports an optional
Redis backend via `ioredis`, gated entirely by the `REDIS_URL` environment
variable — not a separate `RATE_LIMIT_BACKEND` flag. `REDIS_URL` is unset
in this repo (absent from `.env.example`, not configured in any deploy
config), so `getRedisClient()` returns `null` and every rate-limit check
falls through to `checkMemoryLimit()` (in-memory, per-instance).

This confirms Task 3's option (b): **the in-memory backend is what will run
at launch.** `ioredis` remains an installed-but-inert optional dependency
(loaded only if `REDIS_URL` is set — see the module doc comment in
`rateLimiter.ts`), contributes no audit findings, and needs no version
change for this launch. The Redis-backed path stays deferred until a
multi-instance deployment needs shared rate-limit state across processes.
