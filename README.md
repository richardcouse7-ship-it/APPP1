# Irish B2B Website Finder

A React + Express app for enriching Irish business lead lists: finding official
company websites via Gemini Google Search grounding, and (new) crawling a known
company site to extract verified contact details.

## Setup

```bash
bun install   # or npm install
bun run dev   # or npm run dev
```

Set `GEMINI_API_KEY` in `.env` (see `.env.example`). In AI Studio, this is
injected automatically from your project secrets — no local `.env` needed.

## Company Contact Extraction API

`POST /api/extract-contacts`

Crawls a company's homepage plus same-domain contact/about/team subpages
(capped at 6 pages total), then uses Gemini (`gemini-2.5-flash-lite`) to pull
structured contact fields out of the combined page text. Built as a plain API
endpoint (not a Gemini function/tool) so it stays deterministic, rate-limitable,
and easy to slot into the existing batch-driven enrichment workflow instead of
depending on a model to decide when to fire off requests.

**Request**

```json
{ "url": "https://example-company.ie", "companyName": "Example Company (optional)" }
```

**Response**

```json
{
  "status": "SUCCESS",
  "companyName": "Example Company",
  "website": "https://example-company.ie/",
  "generalEmail": "info@example-company.ie",
  "generalPhone": "+353 1 234 5678",
  "address": "12 Main St, Dublin",
  "contacts": [
    {
      "name": "Jane Murphy",
      "role": "Managing Director",
      "roleHint": "MANAGING_DIRECTOR",
      "email": "jane@example-company.ie",
      "phone": null,
      "sourceUrl": "https://example-company.ie/about",
      "confidence": "HIGH"
    }
  ],
  "pagesCrawled": ["https://example-company.ie/", "https://example-company.ie/about"],
  "notes": null
}
```

`contacts` is ordered by priority: business Owner > Managing Director / CEO /
Founder > HR Manager > any other named contact, matching the ICP decision-makers
this pipeline targets.

## Known limitations

- **Single request at a time.** The endpoint has no internal queue or rate
  limiter yet — concurrent callers will run concurrent crawls. Fine for the
  current batch scripts (which already throttle their own concurrency), but
  don't point an unbounded fan-out at it.
- **No `robots.txt` check.** The crawler does not currently consult
  `robots.txt` before requesting pages. Add a check before pointing this at
  sites you don't already have a research relationship with.
- **Cheerio only, no JS rendering.** Sites that render their contact/team
  content client-side (SPA frameworks) will yield thin or empty page text.
  Swapping `CheerioCrawler` for Crawlee's `PlaywrightCrawler` in
  `src/server/contactExtraction/crawler.ts` fixes this at the cost of speed.
- **Outbound network restrictions in some environments.** Sandboxed/CI
  environments with an allowlisted egress proxy will block crawls to
  arbitrary company domains (the crawler will return `SUCCESS` with an empty
  `pages`/`contacts` and a note, rather than crash). This is expected outside
  of environments with open outbound HTTP access, e.g. AI Studio's Cloud Run
  deployment.

## Source layout

- `src/server/contactExtraction/crawler.ts` — Crawlee `CheerioCrawler`, same-domain, capped at 6 pages.
- `src/server/contactExtraction/extractor.ts` — Gemini extraction from crawled text.
- `src/server/contactExtraction/route.ts` — Express router (`POST /api/extract-contacts`).
- `src/server/contactExtraction/types.ts` — shared request/response types.
- `server.ts` — mounts the router alongside the existing enrichment/search endpoints.
