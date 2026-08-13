import { Router } from "express";
import { crawlCompanySite } from "./crawler.js";
import { extractContacts } from "./extractor.js";
import type { ExtractContactsRequest, ExtractContactsResponse } from "./types.js";

export const contactExtractionRouter = Router();

// Single-request-at-a-time: concurrent calls are not queued or rate-limited yet.
// See README "Known limitations" before wiring this up to a batch caller.
contactExtractionRouter.post("/api/extract-contacts", async (req, res) => {
  const { url, companyName }: ExtractContactsRequest = req.body || {};

  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "url is required." });
  }

  try {
    const crawl = await crawlCompanySite(url);
    const extracted = await extractContacts(crawl);

    const responseBody: ExtractContactsResponse = {
      status: "SUCCESS",
      ...extracted,
      companyName: extracted.companyName ?? companyName ?? null,
    };

    res.json(responseBody);
  } catch (error: any) {
    console.error(`Error in /api/extract-contacts for "${url}":`, error);
    const responseBody: ExtractContactsResponse = {
      status: "FAILED",
      error: error.message || "Contact extraction failed.",
      companyName: companyName ?? null,
      website: url,
      generalEmail: null,
      generalPhone: null,
      address: null,
      contacts: [],
      pagesCrawled: [],
      notes: null,
    };
    res.status(500).json(responseBody);
  }
});
