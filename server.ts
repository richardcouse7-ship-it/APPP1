import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import dotenv from "dotenv";
import { normalizeString, getApexDomain, cleanNullableField } from "./src/utils/normalize";
import { requireAuth } from "./src/middleware/auth";
import { createRateLimiter } from "./src/middleware/rateLimiter";
import { sanitizePromptInput, isValidUrl } from "./src/utils/sanitize";
import { getCachedEnrichment, setCachedEnrichment } from "./src/services/serverCache";
import { buildDatasetSummary } from "./src/utils/datasetSummary";

dotenv.config();

// Configurable model names — override via env vars
const MODEL_ENRICHMENT = process.env.MODEL_ENRICHMENT || "gemini-3.6-flash";
const MODEL_ANALYTICS = process.env.MODEL_ANALYTICS || "gemini-3.5-flash";
const MODEL_TTS = process.env.MODEL_TTS || "gemini-3.1-flash-tts-preview";

// Rate limiters — 30 enrichment requests per minute per IP
const enrichmentRateLimiter = createRateLimiter(30, 60_000);
// More lenient limit for read-only / analytics endpoints
const generalRateLimiter = createRateLimiter(60, 60_000);

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

app.use(express.json({ limit: "10mb" }));

// Server-Side Cache — L1 in-memory + L2 Firestore (see serverCache.ts)
// The old in-memory Map has been replaced by the dual-layer cache service.

// Initialize Gemini Client
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not configured.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// Banned directory list for extra verification safeguard
const BANNED_DIRECTORIES = [
  "goldenpages.ie",
  "solocheck.ie",
  "vision-net.ie",
  "visionnet.ie",
  "companycheck.co.uk",
  "rip.ie",
  "yelp.ie",
  "yelp.com",
  "google.com/maps",
  "maps.google",
  "tripadvisor",
  "linkedin.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "tiktok.com",
  "youtube.com",
];

interface EnrichOptions {
  modelName?: string;
  forceRefresh?: boolean;
  mode?: 'LIGHT_SWEEP' | 'FULL_ENRICHMENT';
  eircode?: string;
  rawRowData?: Record<string, any>;
}

function buildAddressContext(county: string, eircode?: string, rawRowData?: Record<string, any>): string {
  const parts: string[] = [];
  if (county) parts.push(county);
  if (eircode) parts.push(eircode);
  if (rawRowData) {
    const fallbackKeys = ["company_address_4", "company_address_3", "company_address_2", "company_address_1"];
    for (const key of fallbackKeys) {
      const val = rawRowData[key];
      if (typeof val === "string" && val.trim()) {
        parts.push(val.trim());
      }
    }
  }
  return parts.length > 0 ? parts.join(", ") : (county || "Ireland");
}

interface LinkedInFallbackResult {
  linkedin_url: string | null;
  strategy_used: string | null;
}

async function queryLinkedInFallback(query: string, targetModel: string): Promise<string | null> {
  const prompt = `Find the LinkedIn personal profile URL (/in/) for the person described below.
${query}
Return ONLY the URL or null as raw JSON: { "linkedin_url": "<URL or null>" }`;

  let responseText = "";

  if (targetModel.startsWith("perplexity")) {
    const perplexityKey = process.env.PERPLEXITY_API_KEY;
    if (!perplexityKey) return null;
    const perpModelName = targetModel.includes("pro") ? "sonar-pro" : "sonar";

    const perpRes = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${perplexityKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(6000),
      body: JSON.stringify({
        model: perpModelName,
        messages: [
          {
            role: "system",
            content: "You are a LinkedIn profile resolution assistant. Respond strictly in raw JSON without markdown blocks.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
      }),
    });

    if (!perpRes.ok) return null;
    const perpData = await perpRes.json();
    responseText = perpData.choices?.[0]?.message?.content || "";
  } else {
    const ai = getGeminiClient();
    const geminiPromise = ai.models.generateContent({
      model: targetModel,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        temperature: 0.1,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("LinkedIn fallback query timed out after 6s")), 6000)
    );

    const response: any = await Promise.race([geminiPromise, timeoutPromise]);
    responseText = response.text || "";
  }

  const cleanText = responseText.replace(/```json/gi, "").replace(/```/g, "").trim();
  let parsed: any = null;
  try {
    parsed = JSON.parse(cleanText);
  } catch {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
        return null;
      }
    }
  }

  const url = parsed?.linkedin_url;
  return typeof url === "string" && url.trim() ? url.trim() : null;
}

async function resolveLinkedInFallback(
  decisionMakerName: string,
  companyName: string,
  county: string | null,
  industry: string | null,
  targetModel: string
): Promise<LinkedInFallbackResult> {
  try {
    const strategyAQuery = `"${decisionMakerName}" "${companyName}" ${county ? `"${county}"` : ""} LinkedIn`;
    const strategyAPrompt = `${decisionMakerName} works at ${companyName} in ${county || "Ireland"}. Query: ${strategyAQuery}`;
    const strategyAUrl = await queryLinkedInFallback(strategyAPrompt, targetModel);
    if (strategyAUrl) {
      console.log(`[LINKEDIN FALLBACK] Company: "${companyName}" | DM: "${decisionMakerName}" | Strategy: "A" | URL: "${strategyAUrl}"`);
      return { linkedin_url: strategyAUrl, strategy_used: "A" };
    }

    const strategyBQuery = `"${decisionMakerName}" "${industry || "business"}" Ireland LinkedIn`;
    const strategyBPrompt = `${decisionMakerName} works in the ${industry || "business"} sector in Ireland. Query: ${strategyBQuery}`;
    const strategyBUrl = await queryLinkedInFallback(strategyBPrompt, targetModel);
    if (strategyBUrl) {
      console.log(`[LINKEDIN FALLBACK] Company: "${companyName}" | DM: "${decisionMakerName}" | Strategy: "B" | URL: "${strategyBUrl}"`);
      return { linkedin_url: strategyBUrl, strategy_used: "B" };
    }

    console.log(`[LINKEDIN FALLBACK] Company: "${companyName}" | DM: "${decisionMakerName}" | All strategies exhausted — confirmed NOT_FOUND.`);
    return { linkedin_url: null, strategy_used: null };
  } catch (err) {
    console.warn(`[LINKEDIN FALLBACK] Company: "${companyName}" | DM: "${decisionMakerName}" | Fallback attempt failed:`, err);
    return { linkedin_url: null, strategy_used: null };
  }
}

async function enrichBusinessRecord(
  companyName: string,
  county: string,
  companyNumber?: string,
  options: EnrichOptions = {}
) {
  // Sanitize all user-supplied inputs to prevent prompt injection
  companyName = sanitizePromptInput(companyName);
  county = sanitizePromptInput(county);
  companyNumber = companyNumber ? sanitizePromptInput(companyNumber) : undefined;

  if (!companyName) {
    throw new Error("companyName is required and must be non-empty after sanitization.");
  }

  const mode: "LIGHT_SWEEP" | "FULL_ENRICHMENT" = options.mode === "LIGHT_SWEEP" ? "LIGHT_SWEEP" : "FULL_ENRICHMENT";
  const cacheKey = `${mode === "LIGHT_SWEEP" ? "light" : "full"}_${normalizeString(companyName)}_${normalizeString(county || "")}`;

  // Check persistent cache (L1 in-memory + L2 Firestore) unless forced refresh
  if (!options.forceRefresh) {
    const cached = await getCachedEnrichment(cacheKey);
    if (cached) {
      console.log(`[CACHE HIT] Returning cached enrichment for "${companyName}" (${county})`);
      return cached;
    }
  }

  const ai = getGeminiClient();
  const targetModel = options.modelName || MODEL_ENRICHMENT;

  const fullEnrichmentPrompt = `You are an expert Irish B2B Lead Research Analyst and Web Intelligence Extraction Agent.

YOUR TASK:
For this Irish business:
Business Name: "${companyName}"
County/Location: "${county}"
${companyNumber ? `CRO Registration Number: "${companyNumber}"` : ""}

1. CROSS-REFERENCE CRO NUMBER: If a CRO registration number is provided, verify it matches the business name. If the CRO number does not match, note the discrepancy and proceed with name+county search only.

2. FIND OFFICIAL WEBSITE: Search for and identify the official, primary website domain URL.
   - The URL MUST start with "http://" or "https://" and be a valid, well-formed URL.
   - PREFER Irish domain extensions (.ie) when the company is an Irish trading entity with a .ie website.
   - EXCLUDE directories (goldenpages.ie, solocheck.ie, vision-net.ie, companycheck.co.uk, rip.ie, yelp.ie, yelp.com, google.com/maps, maps.google, tripadvisor).
   - EXCLUDE social media platforms UNLESS no official domain exists AND an active official Facebook page exists for this business in County ${county}.
   - If the business name is common or generic (e.g., "Murphy Construction", "O'Brien Services"), use the CRO number, full address context, and phone number to disambiguate. Do NOT return a website for a similarly named but different company.

3. CONDUCT B2B LEAD RESEARCH & WEBSITE VERIFICATION:
   - Industry / Sector: Determine business sector (e.g. Dairy & Agriculture, Food & Beverage, Construction, Software & Tech, Retail, Logistics).
   - Company Summary: Write a concise 1-2 sentence overview of what the company does based on their website or web footprint.
   - Key Decision Maker (DM): Identify CEO, Managing Director, Founder, Owner, or top executive (Full Name e.g. "John Murphy").
   - Decision Maker Role: Their official title/role (e.g. "Managing Director", "Chief Executive Officer", "Owner", "Founder").
   - LinkedIn Research (Priority Fallback Order):
     1. Search for Key Decision Maker's personal LinkedIn profile URL (e.g. https://www.linkedin.com/in/...). If found, set "linkedin_url" to that URL and "linkedin_type" to "DECISION_MAKER".
     2. Fallback: If no personal decision maker LinkedIn page is found, search for official Business / Company LinkedIn page (e.g. https://www.linkedin.com/company/...). If found, set "linkedin_url" to that URL and "linkedin_type" to "COMPANY".
     3. If neither can be found, set "linkedin_url" to null and "linkedin_type" to "NOT_FOUND".
   - Primary Company Phone: Main general office/reception phone number if publicly listed. Do NOT search for personal direct-dial phone numbers for the Decision Maker.
   - Company Contact Email: Main public info/sales email (e.g. info@domain.ie) if publicly listed. Do NOT search for direct personal email addresses for the Decision Maker.
   - Verification Status: "VERIFIED_ACTIVE" if official site confirmed, "VERIFIED_FACEBOOK" if FB page used, or "UNVERIFIED".

STRICT OUTPUT FORMAT:
Return ONLY a raw JSON object (no markdown code blocks, no commentary):
{
  "business_name": "${companyName}",
  "county": "${county}",
  "official_website_url": "<VALID_FULL_URL_STARTING_WITH_HTTP(S)_OR_NULL>",
  "industry": "<PRIMARY_INDUSTRY_OR_NULL>",
  "company_summary": "<1_2_SENTENCE_BUSINESS_OVERVIEW_OR_NULL>",
  "decision_maker_name": "<KEY_EXECUTIVE_FULL_NAME_OR_NULL>",
  "decision_maker_role": "<KEY_EXECUTIVE_TITLE_ROLE_OR_NULL>",
  "linkedin_url": "<LINKEDIN_URL_OR_NULL>",
  "linkedin_type": "DECISION_MAKER" | "COMPANY" | "NOT_FOUND",
  "phone_number": "<PUBLIC_PHONE_OR_NULL>",
  "contact_email": "<PUBLIC_EMAIL_OR_NULL>",
  "verification_status": "VERIFIED_ACTIVE" | "VERIFIED_FACEBOOK" | "UNVERIFIED",
  "confidence_score": "HIGH" | "MEDIUM" | "LOW",
  "match_type": "OFFICIAL_WEBSITE" | "FACEBOOK_FALLBACK" | "NOT_FOUND",
  "notes": "<Brief 1-sentence reasoning for selection, including any disambiguation logic used>"
}

IMPORTANT: All values must be considered "Unverified from public web sources" if metrics cannot be confirmed via official registries or the company's own website. If you are uncertain whether a website belongs to this specific business, set confidence_score to "LOW" and explain in notes.`;

  const addressContext = buildAddressContext(county, options.eircode, options.rawRowData);
  const lightSweepPrompt = `You are a fast Irish business verification agent running a bulk "Light Sweep" pass.

Target Irish Business:
- Business Name: "${companyName}"
- Address Context: "${addressContext}"
${companyNumber ? `- CRO Registration Number: "${companyNumber}"` : ""}

TASK: Verify if this Irish company is an active trading business, and identify its official website if available.
- trading_status: Return "TRADING" if this is an active operating business, active limited company, sole trader, or trading entity in Ireland. Return "DORMANT_OR_SHELL" ONLY if it is explicitly confirmed to be dissolved, liquidated, struck off, or out of business. If no information is found at all, return "NOT_FOUND".
- website: The official direct website URL if found, or null. EXCLUDE directory sites (solocheck.ie, goldenpages.ie, vision-net.ie, rip.ie, yelp, tripadvisor, google maps) and social media pages.
- category: Short primary industry category (e.g. "Construction", "Retail", "Services", "Manufacturing").
- phone: Public phone number if listed, or null.

STRICT JSON OUTPUT FORMAT:
Return ONLY a raw JSON object:
{
  "website": "<VALID_FULL_URL_OR_NULL>",
  "trading_status": "TRADING" | "DORMANT_OR_SHELL" | "NOT_FOUND",
  "category": "<SHORT_CATEGORY_OR_NULL>",
  "phone": "<PUBLIC_PHONE_OR_NULL>"
}`;

  const prompt = mode === "LIGHT_SWEEP" ? lightSweepPrompt : fullEnrichmentPrompt;

  let responseText = "";
  let sources: any[] = [];
  let maxRetries = 3;
  let delayMs = 2500;

  if (targetModel.startsWith("perplexity")) {
    const perplexityKey = process.env.PERPLEXITY_API_KEY;
    if (!perplexityKey) {
      throw new Error("PERPLEXITY_API_KEY environment variable is required to use Perplexity AI. Please set it in Settings.");
    }
    const perpModelName = targetModel.includes("pro") ? "sonar-pro" : "sonar";

    const perpRes = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${perplexityKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(18000),
      body: JSON.stringify({
        model: perpModelName,
        messages: [
          {
            role: "system",
            content: "You are an expert Irish B2B Lead Research Analyst. Respond strictly in raw JSON without markdown blocks.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.1,
      }),
    });

    if (!perpRes.ok) {
      const errText = await perpRes.text();
      throw new Error(`Perplexity API Error (${perpRes.status}): ${errText}`);
    }

    const perpData = await perpRes.json();
    responseText = perpData.choices?.[0]?.message?.content || "";
    if (Array.isArray(perpData.citations)) {
      sources = perpData.citations.map((url: string) => ({ title: url, url }));
    }
  } else {
    // Gemini API Request with Exponential Backoff and Timeout
    const ai = getGeminiClient();
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const geminiPromise = ai.models.generateContent({
          model: targetModel,
          contents: prompt,
          config: {
            tools: [{ googleSearch: {} }],
            temperature: 0.1,
            responseMimeType: "application/json",
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        });

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Gemini API request timed out after 18s")), 18000)
        );

        const response: any = await Promise.race([geminiPromise, timeoutPromise]);

        responseText = response.text || "";
        const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
        sources = groundingChunks
          .map((chunk: any) => chunk.web)
          .filter((web: any) => web && web.uri)
          .map((web: any) => ({ title: web.title || web.uri, url: web.uri }));
        
        break; // Success
      } catch (err: any) {
        const isRateLimit = err.status === 429 || err.message?.includes("429") || err.message?.includes("RESOURCE_EXHAUSTED");
        if (isRateLimit && attempt < maxRetries) {
          console.warn(`Rate limit hit (attempt ${attempt}/${maxRetries}). Retrying in ${delayMs}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          delayMs *= 2; // Exponential backoff
        } else {
          if (isRateLimit) {
            throw new Error("Gemini API rate limit exceeded. Please wait a few seconds before retrying.");
          }
          throw err;
        }
      }
    }
  }

  let resultJson: any = null;
  try {
    const cleanText = responseText
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();
    resultJson = JSON.parse(cleanText);
  } catch (err) {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        resultJson = JSON.parse(jsonMatch[0]);
      } catch (e) {
        console.error("Failed to parse JSON response:", responseText);
      }
    }
  }

  if (mode === "LIGHT_SWEEP") {
    let websiteUrl = resultJson?.website || null;
    const tradingStatus = resultJson?.trading_status || "NOT_FOUND";
    const category = cleanNullableField(resultJson?.category);
    const phone = cleanNullableField(resultJson?.phone);

    if (websiteUrl) {
      const lowerUrl = websiteUrl.toLowerCase();
      const isBanned = BANNED_DIRECTORIES.some((d) => lowerUrl.includes(d));
      if (isBanned || !isValidUrl(websiteUrl)) websiteUrl = null;
    }

    const apexDomain = getApexDomain(websiteUrl);

    const lightSweepResult = {
      official_website_url: websiteUrl,
      tradingStatus,
      category,
      phoneNumber: phone,
      apexDomain,
      confidence_score: websiteUrl && tradingStatus === "TRADING" ? "MEDIUM" : "LOW",
      notes:
        websiteUrl && tradingStatus === "TRADING"
          ? "Verified trading via Light Sweep pass."
          : "Light Sweep found no confirmed active trading website.",
      fromCache: false,
    };

    await setCachedEnrichment(cacheKey, lightSweepResult);
    return lightSweepResult;
  }

  let websiteUrl = resultJson?.official_website_url || null;
  let matchType = resultJson?.match_type || "NOT_FOUND";
  let confidence = resultJson?.confidence_score || "LOW";
  let notes = resultJson?.notes || "Research completed via Google Search Grounding.";

  if (websiteUrl) {
    const lowerUrl = websiteUrl.toLowerCase();
    const isBanned = BANNED_DIRECTORIES.some((d) => lowerUrl.includes(d));
    const isFacebook = lowerUrl.includes("facebook.com");

    // Reject malformed or invalid URLs
    if (!isValidUrl(websiteUrl)) {
      websiteUrl = null;
      matchType = "NOT_FOUND";
      confidence = "LOW";
      notes = "LLM returned an invalid URL format; no official website confirmed.";
    } else if (isBanned) {
      websiteUrl = null;
      matchType = "NOT_FOUND";
      confidence = "LOW";
      notes = "Filtered out directory link from initial search; no official direct domain confirmed.";
    } else if (isFacebook && matchType !== "FACEBOOK_FALLBACK") {
      matchType = "FACEBOOK_FALLBACK";
      confidence = "MEDIUM";
      if (!notes) notes = "Official Facebook page identified as company domain fallback.";
    } else if (!isFacebook && !isBanned && matchType === "NOT_FOUND") {
      matchType = "OFFICIAL_WEBSITE";
      confidence = "HIGH";
    }
  } else {
    matchType = "NOT_FOUND";
    confidence = "LOW";
  }

  const enrichedResult = {
    business_name: resultJson?.business_name || companyName,
    county: resultJson?.county || county,
    official_website_url: websiteUrl,
    apexDomain: getApexDomain(websiteUrl),
    industry: cleanNullableField(resultJson?.industry),
    companySummary: cleanNullableField(resultJson?.company_summary),
    decisionMakerName: cleanNullableField(resultJson?.decision_maker_name),
    decisionMakerRole: cleanNullableField(resultJson?.decision_maker_role),
    linkedinUrl: resultJson?.linkedin_url || null,
    linkedinType: resultJson?.linkedin_type || (resultJson?.linkedin_url ? (resultJson.linkedin_url.includes('/in/') ? 'DECISION_MAKER' : 'COMPANY') : 'NOT_FOUND'),
    phoneNumber: cleanNullableField(resultJson?.phone_number),
    contactEmail: cleanNullableField(resultJson?.contact_email),
    verificationStatus: resultJson?.verification_status || (websiteUrl ? (matchType === 'FACEBOOK_FALLBACK' ? 'VERIFIED_FACEBOOK' : 'VERIFIED_ACTIVE') : 'UNVERIFIED'),
    confidence_score: confidence,
    match_type: matchType,
    notes,
    grounding_sources: sources,
    fromCache: false,
  };

  if (enrichedResult.linkedinType === "NOT_FOUND" && enrichedResult.decisionMakerName != null) {
    const fallbackResult = await resolveLinkedInFallback(
      sanitizePromptInput(enrichedResult.decisionMakerName),
      companyName,
      county || null,
      enrichedResult.industry ? sanitizePromptInput(enrichedResult.industry) : null,
      targetModel
    );
    if (fallbackResult.linkedin_url != null) {
      enrichedResult.linkedinUrl = fallbackResult.linkedin_url;
      enrichedResult.linkedinType = "DECISION_MAKER";
      enrichedResult.notes = `${enrichedResult.notes} | LinkedIn resolved via fallback strategy ${fallbackResult.strategy_used}.`;
    }
  }

  // Save to persistent cache (L1 + L2)
  await setCachedEnrichment(cacheKey, enrichedResult);

  return enrichedResult;
}

// Healthcheck API
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    hasApiKey: Boolean(process.env.GEMINI_API_KEY),
    timestamp: new Date().toISOString(),
  });
});

// Single Company Enrichment API
app.post("/api/enrich-single", requireAuth, enrichmentRateLimiter, async (req, res) => {
  try {
    const { id, companyName, county, companyNumber, modelName, forceRefresh, mode, eircode, rawRowData } = req.body;
    if (!companyName || !county) {
      return res.status(400).json({ error: "companyName and county are required." });
    }

    const enrichment = await enrichBusinessRecord(companyName, county, companyNumber, {
      modelName,
      forceRefresh,
      mode,
      eircode,
      rawRowData,
    });
    res.json({ id, ...enrichment });
  } catch (error: any) {
    console.error("Error in /api/enrich-single:", error);
    res.status(500).json({
      error: error.message || "Failed to enrich business record.",
    });
  }
});

// Batch Companies Enrichment API
app.post("/api/enrich-batch", requireAuth, enrichmentRateLimiter, async (req, res) => {
  try {
    const { companies, modelName, forceRefresh, mode } = req.body;
    if (!Array.isArray(companies) || companies.length === 0) {
      return res.status(400).json({ error: "companies must be a non-empty array." });
    }

    const results = [];
    // Process companies with concurrency limit of 3 to ensure fast and reliable execution
    const batchSize = 3;
    for (let i = 0; i < companies.length; i += batchSize) {
      const chunk = companies.slice(i, i + batchSize);
      const chunkPromises = chunk.map(async (company: any) => {
        try {
          const enrichment = await enrichBusinessRecord(
            company.companyName,
            company.county || company.address4,
            company.companyNumber,
            { modelName, forceRefresh, mode, eircode: company.eircode, rawRowData: company.rawRowData }
          );
          return {
            id: company.id,
            companyNumber: company.companyNumber || "",
            companyName: company.companyName,
            county: company.county || company.address4,
            status: "SUCCESS" as const,
            ...enrichment,
          };
        } catch (err: any) {
          console.error(`Failed to enrich company ${company.companyName}:`, err);
          return {
            id: company.id,
            companyNumber: company.companyNumber || "",
            companyName: company.companyName,
            county: company.county || company.address4,
            status: "FAILED" as const,
            official_website_url: null,
            confidence_score: "LOW" as const,
            match_type: "NOT_FOUND" as const,
            notes: `Enrichment error: ${err.message || "API request failed"}`,
            grounding_sources: [],
          };
        }
      });

      const chunkResults = await Promise.all(chunkPromises);
      results.push(...chunkResults);
    }

    res.json({ results });
  } catch (error: any) {
    console.error("Error in /api/enrich-batch:", error);
    res.status(500).json({
      error: error.message || "Batch enrichment failed.",
    });
  }
});

// Google Maps Grounding API
app.post("/api/maps-search", requireAuth, generalRateLimiter, async (req, res) => {
  try {
    const { query, county } = req.body;
    if (!query) {
      return res.status(400).json({ error: "Search query is required." });
    }

    const ai = getGeminiClient();
    const prompt = `Search Google Maps for the following Irish business query in County ${county || "Ireland"}: "${query}".
Return place name, full street address, county, website URL if available, rating, and brief description.
Provide the response as a clear structured JSON array of place objects.`;

    const response = await ai.models.generateContent({
      model: MODEL_ANALYTICS,
      contents: prompt,
      config: {
        tools: [{ googleMaps: {} }],
      },
    });

    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const mapSources = groundingChunks
      .map((chunk: any) => chunk.web || chunk.maps)
      .filter(Boolean);

    res.json({
      text: response.text || "",
      sources: mapSources,
    });
  } catch (error: any) {
    console.error("Error in /api/maps-search:", error);
    res.status(500).json({ error: error.message || "Google Maps Search failed." });
  }
});

// Gemini Intelligence Dataset Analytics & Lead Scoring API
app.post("/api/ai-analyze-dataset", requireAuth, generalRateLimiter, async (req, res) => {
  try {
    const { records, prompt: userPrompt } = req.body;
    if (!records || !Array.isArray(records)) {
      return res.status(400).json({ error: "records array is required." });
    }

    const ai = getGeminiClient();
    const summaryData = buildDatasetSummary(records);

    const systemPrompt = `You are an elite B2B Sales Intelligence Strategist for the Irish Market.
Analyze the following dataset of ${records.length} Irish business leads and answer the user query or provide a high-value B2B Lead Intelligence Report.

Focus Areas:
1. Top Priority High-Value B2B Prospect Targets (companies with verified websites & decision-maker contacts).
2. Key Industry Breakdown & Geographic Clusters across Irish Counties (e.g. Cork, Dublin, Galway).
3. Data Completeness Gaps & Actionable Lead Enrichment Recommendations.
4. Custom Cold Outreach Pitch Template tailored to the identified decision makers.

User Query/Context: ${userPrompt || "Generate a full B2B Lead Strategy & Quality Audit Report."}
Dataset Sample: ${JSON.stringify(summaryData, null, 2)}`;

    const response = await ai.models.generateContent({
      model: MODEL_ANALYTICS,
      contents: systemPrompt,
    });

    res.json({ analysis: response.text || "No response generated." });
  } catch (error: any) {
    console.error("Error in /api/ai-analyze-dataset:", error);
    res.status(500).json({ error: error.message || "AI Analysis failed." });
  }
});

// Voice Conversation API (Speech TTS & Assistant)
app.post("/api/voice-assistant", requireAuth, generalRateLimiter, async (req, res) => {
  try {
    const { prompt, voice = "Kore" } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "Prompt text is required." });
    }

    const ai = getGeminiClient();

    // Generate concise conversational text answer
    const textResponse = await ai.models.generateContent({
      model: MODEL_ANALYTICS,
      contents: `You are an Irish business research voice assistant. Provide a brief, conversational 2-3 sentence spoken update for: ${prompt}`,
    });

    const replyText = textResponse.text || "I have analyzed your request.";

    // Generate speech audio using TTS preview
    let audioBase64: string | null = null;
    try {
      const ttsResponse = await ai.models.generateContent({
        model: MODEL_TTS,
        contents: [{ parts: [{ text: replyText }] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voice },
            },
          },
        },
      });

      audioBase64 = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
    } catch (ttsErr) {
      console.warn("TTS Audio generation skipped/fallback:", ttsErr);
    }

    res.json({
      replyText,
      audioBase64,
    });
  } catch (error: any) {
    console.error("Error in /api/voice-assistant:", error);
    res.status(500).json({ error: error.message || "Voice assistant failed." });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

// Exported so integration tests can drive the app directly with supertest,
// without binding a port. Vitest sets process.env.VITEST, so the real
// `node server.js` / `node dist/server.cjs` production boot path — which
// never has VITEST set — is unaffected and still calls startServer().
export { app };

if (!process.env.VITEST) {
  startServer();
}
