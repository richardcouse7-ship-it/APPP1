# Irish B2B Website Finder

An Express + Vite app for enriching lists of Irish businesses: given a company name and county, it uses an LLM with web-search grounding (Gemini or Perplexity) to find the official website, industry, decision-maker, LinkedIn, phone, and email, then lets you review, dedupe, and export the results.

Originally built in Google AI Studio; now developed with Claude Code.

## Getting Started

**Prerequisites:** Node.js

```
npm install
```

Copy `.env.example` to `.env` and set `GEMINI_API_KEY` (required). `PERPLEXITY_API_KEY` is optional, needed only if you select a Perplexity model.

```
npm run dev
```

The app runs at `http://localhost:3000` (single Express server; Vite runs in middleware mode in dev).

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the dev server (`tsx server.ts`) |
| `npm run build` | Build the client (Vite) and bundle the server (esbuild) into `dist/` |
| `npm run start` | Run the production build (`node dist/server.cjs`) |
| `npm run lint` | Type-check with `tsc --noEmit` (no test suite exists) |
| `npm run clean` | Remove `dist/` and `server.cjs` |

## How it works

Records go through two tiers:

1. **Tier 1 — Staged Leads Vault**: raw imported records (CSV or Google Sheets), unenriched.
2. **Tier 2 — Final Enriched Data Table**: records promoted from Tier 1 and run through full AI enrichment.

A "Light Sweep" batch mode does a fast trading-status/website check across Tier 1 and auto-promotes hits into Tier 2; a "Full Enrichment" batch mode runs the complete research pipeline on Tier 2 records. Both share the same pacing, 429-backoff, and cancellation logic.

Sign in with Google to sync data to Firestore (per-user) and to import/export via Google Drive/Sheets. Without sign-in, everything persists to `localStorage` only.

## Environment Variables

Beyond `GEMINI_API_KEY` (required) and `PERPLEXITY_API_KEY` (optional, see above), the following variables gate production behavior introduced by the security-hardening work. All are optional and unset by default.

| Variable | Effect | Default |
|---|---|---|
| `ALLOW_UNSAFE_NO_AUTH` | Bypasses fail-closed auth in production when Firebase Admin is unconfigured. **This is a production-auth bypass** — it should not appear in real deploy configs. | Unset (auth enforced; server fails closed if Firebase Admin isn't configured) |
| `REDIS_URL` | Enables Redis-backed rate limiting for multi-instance deployments. | Unset (falls back to an in-memory rate limiter, which is per-instance only) |
| `ENABLE_FIRESTORE_L2` | Enables the Firestore L2 enrichment cache. Only the literal string `"true"` enables it — any other value (including `"1"` or `"TRUE"`) is treated as off. Enabling this has **unmeasured** quota/cost/latency impact, since this path has not yet run against real Firestore in production. | Unset/off |
