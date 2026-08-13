import { GoogleGenAI } from "@google/genai";
import type { CrawlResult, ExtractedContactData } from "./types.js";

const EXTRACTION_MODEL = "gemini-2.5-flash-lite";

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not configured.");
  }
  return new GoogleGenAI({ apiKey });
}

function buildPrompt(crawl: CrawlResult): string {
  const pagesBlock = crawl.pages
    .map((page) => `--- PAGE: ${page.url} ---\nTITLE: ${page.title}\n${page.text}`)
    .join("\n\n");

  return `You are extracting verified business contact information from raw crawled website text for a B2B lead generation pipeline.

SOURCE PAGES (from ${crawl.domain}):
${pagesBlock}

TASK:
Extract structured contact details for this company. When multiple people are mentioned, PRIORITIZE decision-makers in this order: business Owner > Managing Director / CEO / Founder > HR Manager > any other named contact. Do not invent people, emails, or phone numbers that are not present in the text. If a field cannot be found, use null.

For each contact found, classify "roleHint" as one of: OWNER, MANAGING_DIRECTOR, HR_MANAGER, GENERAL_CONTACT, OTHER.

Return ONLY a raw JSON object matching this shape:
{
  "companyName": "<string or null>",
  "generalEmail": "<main info/office email or null>",
  "generalPhone": "<main office phone number or null>",
  "address": "<postal address if listed, or null>",
  "contacts": [
    {
      "name": "<full name or null>",
      "role": "<their stated job title or null>",
      "roleHint": "OWNER" | "MANAGING_DIRECTOR" | "HR_MANAGER" | "GENERAL_CONTACT" | "OTHER",
      "email": "<personal/direct email if listed, else null>",
      "phone": "<personal/direct phone if listed, else null>",
      "sourceUrl": "<page URL this was found on>",
      "confidence": "HIGH" | "MEDIUM" | "LOW"
    }
  ],
  "notes": "<brief 1-sentence note on data quality/completeness, or null>"
}

Order "contacts" with the highest-priority decision-maker first.`;
}

function parseJsonResponse(responseText: string): any {
  const cleaned = responseText.replace(/```json/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function extractContacts(crawl: CrawlResult): Promise<ExtractedContactData> {
  if (crawl.pages.length === 0) {
    return {
      companyName: null,
      website: crawl.startUrl,
      generalEmail: null,
      generalPhone: null,
      address: null,
      contacts: [],
      pagesCrawled: [],
      notes: "No page text could be crawled from this site.",
    };
  }

  const ai = getGeminiClient();
  const response = await ai.models.generateContent({
    model: EXTRACTION_MODEL,
    contents: buildPrompt(crawl),
    config: {
      temperature: 0.1,
      responseMimeType: "application/json",
    },
  });

  const parsed = parseJsonResponse(response.text || "");

  return {
    companyName: parsed?.companyName ?? null,
    website: crawl.startUrl,
    generalEmail: parsed?.generalEmail ?? null,
    generalPhone: parsed?.generalPhone ?? null,
    address: parsed?.address ?? null,
    contacts: Array.isArray(parsed?.contacts) ? parsed.contacts : [],
    pagesCrawled: crawl.pages.map((page) => page.url),
    notes: parsed?.notes ?? null,
  };
}
