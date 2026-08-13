import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "10mb" }));

// Server-Side In-Memory Cache to eliminate duplicate token spend
const ENRICHMENT_CACHE = new Map<string, any>();

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

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function callGeminiWithRetry(apiCall: () => Promise<any>, maxRetries = 4) {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await apiCall();
    } catch (error: any) {
      if (error.status === 429 || error.message?.includes('429')) {
        attempt++;
        if (attempt >= maxRetries) throw error;
        // Exponential backoff: 2s, 4s, 8s, 16s + jitter
        const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
        console.warn(`[Gemini API] 429 Rate Limit Hit. Retrying in ${Math.round(delay / 1000)}s (Attempt ${attempt}/${maxRetries})...`);
        await sleep(delay);
      } else {
        throw error;
      }
    }
  }
}

interface EnrichOptions {
  modelName?: string;
  forceRefresh?: boolean;
  websiteUrl?: string | null;
  websiteText?: string | null;
}

async function scrapeWebsiteText(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000); // 12 second timeout for deep scrape
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    
    if (!response.ok) {
      clearTimeout(timeoutId);
      return null;
    }
    const html = await response.text();
    let combinedText = `[HOMEPAGE]\n${html}`;

    // Regex to find links that look like contact or about pages
    const linkRegex = /<a\s+(?:[^>]*?\s+)?href=["']([^"']*(?:contact|about|team)[^"']*)["']/gi;
    let match;
    const additionalUrls = new Set<string>();
    while ((match = linkRegex.exec(html)) !== null && additionalUrls.size < 2) {
      let href = match[1];
      if (href.startsWith('mailto:') || href.startsWith('tel:')) continue;
      
      try {
        const absoluteUrl = new URL(href, url).href;
        additionalUrls.add(absoluteUrl);
      } catch (e) {
        // ignore invalid urls
      }
    }

    for (const subUrl of additionalUrls) {
      try {
        const subRes = await fetch(subUrl, {
          signal: controller.signal,
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        if (subRes.ok) {
          const subHtml = await subRes.text();
          combinedText += `\n\n[PAGE: ${subUrl}]\n${subHtml}`;
        }
      } catch (subErr) {
        // skip if sub-page fails
      }
    }
    clearTimeout(timeoutId);

    // Very basic regex to strip HTML tags and scripts/styles
    const cleanText = combinedText
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    // Return first 20000 chars to avoid token limits but get enough context
    return cleanText.substring(0, 20000);
  } catch (err) {
    console.warn(`[Scrape Warning] Failed to fetch ${url}:`, (err as any).message);
    return null;
  }
}

async function enrichBusinessRecord(
  companyName: string,
  county: string,
  companyNumber?: string,
  options: EnrichOptions = {}
) {
  const cacheKey = `${companyName.trim().toLowerCase()}_${(county || '').trim().toLowerCase()}_${(companyNumber || '').trim().toLowerCase()}`;

  // Check In-Memory Cache unless forced refresh
  if (!options.forceRefresh && ENRICHMENT_CACHE.has(cacheKey)) {
    console.log(`[CACHE HIT] Returning cached enrichment for "${companyName}" (${county})`);
    return {
      ...ENRICHMENT_CACHE.get(cacheKey),
      fromCache: true,
    };
  }

  console.log("Calling getGeminiClient"); const ai = getGeminiClient();
  const targetModel = options.modelName || "gemini-3.5-flash";

  const prompt = `You are an expert Irish B2B Lead Research Analyst and Web Intelligence Extraction Agent.

YOUR TASK:
For this Irish business:
Business Name: "${companyName}"
County/Location: "${county}"
${companyNumber ? `CRO Registration Number: "${companyNumber}"` : ""}
${options.websiteUrl ? `Official Website URL (from previous sweep): "${options.websiteUrl}"` : ""}

${options.websiteText ? `=== RAW WEBSITE TEXT FROM HOMEPAGE ===\n${options.websiteText}\n====================================\n\nCRITICAL: Analyze the website text provided above to accurately extract the Contact Email, Phone Number, Decision Maker Name/Role, and Company Size.` : ""}

1. CONDUCT B2B LEAD RESEARCH & WEBSITE VERIFICATION (focusing on contact and DM info):
   - Official Website URL: ${options.websiteUrl ? `Use "${options.websiteUrl}" if valid, otherwise find it.` : `Search for and identify the official, primary website domain URL. If they do not have one, you MAY return a directory link (goldenpages.ie, solocheck.ie, localbusinesspages.ie, etc.) or a Facebook/social media page.`}
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
   - Verification Status: "VERIFIED_ACTIVE" if official site confirmed, "VERIFIED_FACEBOOK" if FB page used, "VERIFIED_LINKEDIN" if LinkedIn used, or "UNVERIFIED".
   - Estimated Company Size: Estimate employee headcount scale (e.g. "1-10", "10-50", "50-250", "250+").
   - Peninsula Business Services (PBS) Assessment: Note: PBS stands for Peninsula Business Services (HR, Employment Law, Health & Safety).
     - ICP Rating /100: You MUST calculate this using this strict mathematical rubric:
       - Base Score: Start at 40.
       - If Size is 1-10: +10. If 10-50: +30. If 50+: +40.
       - If Industry is High Risk (Construction, Manufacturing, Agriculture, Healthcare, Hospitality, Logistics): +20.
       - If Industry is Low Risk (Tech, Consulting, Admin): +5.
       - If business is a Sole Trader / individual: -40.
     - Reason for PBS Need: 1 concise sentence explaining why this employer needs Peninsula Business Services.

STRICT OUTPUT FORMAT:
Return ONLY a raw JSON object:
{
  "business_name": "${companyName}",
  "county": "${county}",
  "official_website_url": "<VALID_FULL_URL_OR_NULL>",
  "industry": "<PRIMARY_INDUSTRY_OR_NULL>",
  "company_summary": "<1_2_SENTENCE_BUSINESS_OVERVIEW_OR_NULL>",
  "decision_maker_name": "<KEY_EXECUTIVE_FULL_NAME_OR_NULL>",
  "decision_maker_role": "<KEY_EXECUTIVE_TITLE_ROLE_OR_NULL>",
  "linkedin_url": "<LINKEDIN_URL_OR_NULL>",
  "linkedin_type": "DECISION_MAKER" | "COMPANY" | "NOT_FOUND",
  "phone_number": "<PUBLIC_PHONE_OR_NULL>",
  "contact_email": "<PUBLIC_EMAIL_OR_NULL>",
  "estimated_size": "<ESTIMATED_EMPLOYEE_COUNT_OR_NULL>",
  "icp_rating": <NUMBER_0_TO_100_OR_NULL>,
  "reason_for_pbs_need": "<1_SENTENCE_PBS_HR_SAFETY_REASON_OR_NULL>",
  "verification_status": "VERIFIED_ACTIVE" | "VERIFIED_FACEBOOK" | "UNVERIFIED",
  "confidence_score": "HIGH" | "MEDIUM" | "LOW",
  "match_type": "OFFICIAL_WEBSITE" | "FACEBOOK_FALLBACK" | "NOT_FOUND",
  "notes": "<Brief 1-sentence reasoning for selection>"
}`;

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
  } else if (targetModel.startsWith("gpt-")) {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      throw new Error("OPENAI_API_KEY environment variable is required to use OpenAI models. Please set it in Settings.");
    }

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: targetModel,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "You are an expert Irish B2B Lead Research Analyst. Respond strictly in raw JSON.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.1,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI API Error (${res.status}): ${errText}`);
    }

    const data = await res.json();
    responseText = data.choices?.[0]?.message?.content || "";
  } else if (targetModel.startsWith("claude-")) {
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      throw new Error("ANTHROPIC_API_KEY environment variable is required to use Claude models. Please set it in Settings.");
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: targetModel,
        max_tokens: 2000,
        system: "You are an expert Irish B2B Lead Research Analyst. Respond strictly in raw JSON without markdown blocks.",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.1,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Anthropic API Error (${res.status}): ${errText}`);
    }

    const data = await res.json();
    responseText = data.content?.[0]?.text || "";
  } else {
    // Gemini API Request with Exponential Backoff
    console.log("Calling getGeminiClient"); const ai = getGeminiClient();
    
    try {
      console.log("Calling callGeminiWithRetry with targetModel:", targetModel); const response = await callGeminiWithRetry(() => ai.models.generateContent({
        model: targetModel,
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
          temperature: 0.1,
          //
          // Thinking level NONE eliminates latency overhead for fast grounding calls
        },
      }));

      console.log("Got response"); responseText = response.text || "";
      const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      sources = groundingChunks
        .map((chunk: any) => chunk.web)
        .filter((web: any) => web && web.uri)
        .map((web: any) => ({ title: web.title || web.uri, url: web.uri }));
    } catch (err: any) {
      throw err;
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

  let websiteUrl = resultJson?.official_website_url || null;
  let matchType = resultJson?.match_type || "NOT_FOUND";
  let confidence = resultJson?.confidence_score || "LOW";
  let notes = resultJson?.notes || "Research completed via Google Search Grounding.";

  if (websiteUrl) {
    const lowerUrl = websiteUrl.toLowerCase();
    const isBanned = BANNED_DIRECTORIES.some((d) => lowerUrl.includes(d));
    const isFacebook = lowerUrl.includes("facebook.com");

    if (isBanned) {
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
    industry: resultJson?.industry || null,
    companySummary: resultJson?.company_summary || null,
    decisionMakerName: resultJson?.decision_maker_name || null,
    decisionMakerRole: resultJson?.decision_maker_role || null,
    linkedinUrl: resultJson?.linkedin_url || null,
    linkedinType: resultJson?.linkedin_type || (resultJson?.linkedin_url ? (resultJson.linkedin_url.includes('/in/') ? 'DECISION_MAKER' : 'COMPANY') : 'NOT_FOUND'),
    phoneNumber: resultJson?.phone_number || null,
    contactEmail: resultJson?.contact_email || null,
    estimatedSize: resultJson?.estimated_size || null,
    icpRating: typeof resultJson?.icp_rating === 'number' ? resultJson.icp_rating : (resultJson?.icp_rating ? parseInt(resultJson.icp_rating) : null),
    reasonForPbsNeed: resultJson?.reason_for_pbs_need || null,
    verificationStatus: resultJson?.verification_status || (websiteUrl ? (matchType === 'FACEBOOK_FALLBACK' ? 'VERIFIED_FACEBOOK' : 'VERIFIED_ACTIVE') : 'UNVERIFIED'),
    confidence_score: confidence,
    match_type: matchType,
    notes,
    grounding_sources: sources,
    fromCache: false,
  };

  // Save to in-memory cache
  ENRICHMENT_CACHE.set(cacheKey, enrichedResult);

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
app.post("/api/enrich-single", async (req, res) => {
  try {
    const { id, companyName, county, companyNumber, websiteUrl, modelName, forceRefresh } = req.body;
    if (!companyName || !county) {
      return res.status(400).json({ error: "companyName and county are required." });
    }

    const websiteText = websiteUrl ? await scrapeWebsiteText(websiteUrl) : null;

    const enrichment = await enrichBusinessRecord(companyName, county, companyNumber, {
      modelName,
      forceRefresh,
      websiteUrl,
      websiteText,
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
app.post("/api/enrich-batch", async (req, res) => {
  try {
    const { companies, modelName, forceRefresh } = req.body;
    if (!Array.isArray(companies) || companies.length === 0) {
      return res.status(400).json({ error: "companies must be a non-empty array." });
    }

    const results = [];
    // Process companies with configurable concurrency limit (default 5 for fast parallel execution)
    const concurrency = typeof req.body.concurrency === 'number' && req.body.concurrency >= 1 && req.body.concurrency <= 10
      ? req.body.concurrency
      : 5;

    for (let i = 0; i < companies.length; i += concurrency) {
      const chunk = companies.slice(i, i + concurrency);
      const chunkPromises = chunk.map(async (company: any) => {
        try {
          const urlToScrape = company.websiteUrl || company.official_website_url;
          const websiteText = urlToScrape ? await scrapeWebsiteText(urlToScrape) : null;
          
          const enrichment = await enrichBusinessRecord(
            company.companyName,
            company.county || company.address4,
            company.companyNumber,
            { modelName, forceRefresh, websiteUrl: urlToScrape, websiteText }
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

// High-Speed Bulk Pre-Sweep Lead Screening API (Cheap Sweep for Websites)
app.post("/api/pre-sweep", async (req, res) => {
  try {
    const { companies, modelName } = req.body;
    if (!Array.isArray(companies) || companies.length === 0) {
      return res.status(400).json({ error: "companies must be a non-empty array." });
    }

    console.log("Calling getGeminiClient"); const ai = getGeminiClient();
    // Force Gemini for the Pre-Sweep because it requires Google Search Grounding
    const targetModel = "gemini-3.5-flash-lite";

    // Split input list into small chunks for reliable Google Search Grounding website lookup
    const chunkSize = 3;
    const chunks = [];
    for (let i = 0; i < companies.length; i += chunkSize) {
      chunks.push(companies.slice(i, i + chunkSize));
    }

    const chunkPromises = chunks.map(async (chunk) => {
      const promptData = chunk.map((c) => ({
        id: c.id,
        companyName: c.companyName,
        county: c.county || c.address4 || "Ireland",
      }));

      const systemPrompt = `You are a high-speed data extraction agent.
YOUR TASK: Perform a "cheap sweep" to identify ONLY the official website URL for each of the following Irish businesses.
You MUST return exactly ${chunk.length} items in your JSON array, corresponding exactly to the input IDs.
Do not search for or hallucinate any other data. If a website cannot be found, return null for that company.`;

      try {
        const response = await ai.models.generateContent({
          model: targetModel,
          contents: `${systemPrompt}\n\nBusinesses to sweep:\n${JSON.stringify(promptData, null, 2)}`,
          config: {
            temperature: 0.1,
            //
            tools: [{ googleSearch: {} }],
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  websiteUrl: {
                    type: Type.STRING,
                    description: "The official website URL (starting with http/https) or null if not found."
                  }
                },
                required: ["id"]
              }
            }
          }
        });

        const text = response.text?.trim() || "[]";
        let parsed = [];
        try {
          parsed = JSON.parse(text);
        } catch (e) {
          console.warn("Failed to parse JSON response from pre-sweep chunk:", text);
        }
        return parsed;
      } catch (err: any) {
        console.error("Error processing pre-sweep chunk:", err);
        return chunk.map((item) => ({
          id: item.id,
          websiteUrl: null,
        }));
      }
    });

    const chunkResults = await Promise.all(chunkPromises);
    const results = chunkResults.flat();

    res.json({ results });
  } catch (error: any) {
    console.error("Error in /api/pre-sweep:", error);
    res.status(500).json({
      error: error.message || "High-speed pre-sweep failed.",
    });
  }
});

// Google Maps Grounding API
app.post("/api/maps-search", async (req, res) => {
  try {
    const { query, county } = req.body;
    if (!query) {
      return res.status(400).json({ error: "Search query is required." });
    }

    console.log("Calling getGeminiClient"); const ai = getGeminiClient();
    const prompt = `Search Google Maps for the following Irish business query in County ${county || "Ireland"}: "${query}".
Return place name, full street address, county, website URL if available, rating, and brief description.
Provide the response as a clear structured JSON array of place objects.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
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
app.post("/api/ai-analyze-dataset", async (req, res) => {
  try {
    const { records, prompt: userPrompt } = req.body;
    if (!records || !Array.isArray(records)) {
      return res.status(400).json({ error: "records array is required." });
    }

    console.log("Calling getGeminiClient"); const ai = getGeminiClient();
    const summaryData = records.slice(0, 50).map((r: any) => ({
      name: r.companyName,
      county: r.county,
      website: r.official_website_url,
      decisionMaker: r.decisionMakerName,
      role: r.decisionMakerRole,
      industry: r.industry,
      matchType: r.match_type,
    }));

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
      model: "gemini-3.5-flash",
      contents: systemPrompt,
    });

    res.json({ analysis: response.text || "No response generated." });
  } catch (error: any) {
    console.error("Error in /api/ai-analyze-dataset:", error);
    res.status(500).json({ error: error.message || "AI Analysis failed." });
  }
});

// Voice Conversation API (Speech TTS & Assistant)
app.post("/api/voice-assistant", async (req, res) => {
  try {
    const { prompt, voice = "Kore" } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "Prompt text is required." });
    }

    console.log("Calling getGeminiClient"); const ai = getGeminiClient();

    // Generate concise conversational text answer
    const textResponse = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `You are an Irish business research voice assistant. Provide a brief, conversational 2-3 sentence spoken update for: ${prompt}`,
    });

    const replyText = textResponse.text || "I have analyzed your request.";

    // Generate speech audio using TTS preview
    let audioBase64: string | null = null;
    try {
      const ttsResponse = await ai.models.generateContent({
        model: "gemini-3.1-flash-tts-preview",
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

startServer();
