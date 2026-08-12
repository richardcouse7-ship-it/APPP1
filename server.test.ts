import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import request from "supertest";

// Mock @google/genai so tests never make real network calls to Gemini.
// mockGenerateContent is reassigned per-test to control success/failure.
const mockGenerateContent = vi.fn();
vi.mock("@google/genai", () => {
  return {
    GoogleGenAI: vi.fn().mockImplementation(function () {
      return { models: { generateContent: mockGenerateContent } };
    }),
    ThinkingLevel: { LOW: "LOW" },
  };
});

// GEMINI_API_KEY must be set before any request hits getGeminiClient(), and
// VITEST is already set by the test runner itself — server.ts uses it to
// skip startServer()/app.listen() so importing the app here binds no port.
process.env.GEMINI_API_KEY = "test-gemini-key";

let app: import("express").Express;
let clearL1Cache: () => void;

beforeAll(async () => {
  ({ app } = await import("./server"));
  ({ clearL1Cache } = await import("./src/services/serverCache"));
});

beforeEach(() => {
  mockGenerateContent.mockReset();
  clearL1Cache();
});

function geminiJsonResponse(payload: Record<string, unknown>) {
  return {
    text: JSON.stringify(payload),
    candidates: [{ groundingMetadata: { groundingChunks: [] } }],
  };
}

const FULL_ENRICHMENT_PAYLOAD = {
  business_name: "Kerry Group PLC",
  county: "Kerry",
  official_website_url: "https://www.kerrygroup.com",
  industry: "Food & Beverage Manufacturing",
  company_summary: "Global taste and nutrition company.",
  decision_maker_name: "Edmond Scanlon",
  decision_maker_role: "Chief Executive Officer",
  // Deliberately pre-resolved so the mocked success responses don't also
  // trigger enrichBusinessRecord's extra LinkedIn-fallback Gemini calls,
  // keeping mockGenerateContent's call count 1:1 with enrichment calls.
  linkedin_url: "https://www.linkedin.com/in/edmond-scanlon",
  linkedin_type: "DECISION_MAKER",
  phone_number: "+353 66 718 2000",
  contact_email: "contact@kerry.com",
  verification_status: "VERIFIED_ACTIVE",
  confidence_score: "HIGH",
  match_type: "OFFICIAL_WEBSITE",
  notes: "Verified via official domain.",
};

describe("POST /api/enrich-single", () => {
  it("rejects malformed input missing companyName/county with 400", async () => {
    const res = await request(app).post("/api/enrich-single").send({ companyNumber: "123" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/companyName and county are required/i);
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it("returns enriched data on the success path", async () => {
    mockGenerateContent.mockResolvedValue(geminiJsonResponse(FULL_ENRICHMENT_PAYLOAD));

    const res = await request(app)
      .post("/api/enrich-single")
      .send({ id: "row-1", companyName: "Kerry Group PLC", county: "Kerry" });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("row-1");
    expect(res.body.official_website_url).toBe("https://www.kerrygroup.com");
    expect(res.body.decisionMakerName).toBe("Edmond Scanlon");
    expect(res.body.contactEmail).toBe("contact@kerry.com");
    expect(res.body.match_type).toBe("OFFICIAL_WEBSITE");
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it(
    "retries a rate-limited Gemini call with exponential backoff, then surfaces a friendly error once retries are exhausted",
    async () => {
      // Real timers: enrichBusinessRecord's backoff delays (2.5s, 5s) are
      // hardcoded, not injectable, so this pays the real wall-clock cost
      // rather than risking fake-timer/supertest deadlocks.
      const rateLimitError = Object.assign(new Error("429 RESOURCE_EXHAUSTED"), { status: 429 });
      mockGenerateContent.mockRejectedValue(rateLimitError);

      const res = await request(app)
        .post("/api/enrich-single")
        .send({ companyName: "Backoff Test Co", county: "Cork" });

      expect(mockGenerateContent).toHaveBeenCalledTimes(3); // maxRetries
      expect(res.status).toBe(500);
      expect(res.body.error).toMatch(/rate limit exceeded/i);
    },
    15_000
  );
});

describe("POST /api/enrich-batch", () => {
  it("rejects malformed input (missing/empty companies array) with 400", async () => {
    const resMissing = await request(app).post("/api/enrich-batch").send({});
    expect(resMissing.status).toBe(400);
    expect(resMissing.body.error).toMatch(/companies must be a non-empty array/i);

    const resEmpty = await request(app).post("/api/enrich-batch").send({ companies: [] });
    expect(resEmpty.status).toBe(400);
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it("returns enriched results for each company on the success path", async () => {
    mockGenerateContent.mockResolvedValue(geminiJsonResponse(FULL_ENRICHMENT_PAYLOAD));

    const res = await request(app)
      .post("/api/enrich-batch")
      .send({
        companies: [
          { id: "a", companyName: "Kerry Group PLC", county: "Kerry" },
          { id: "b", companyName: "Glanbia PLC", county: "Kilkenny" },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(2);
    expect(res.body.results[0].status).toBe("SUCCESS");
    expect(res.body.results[0].decisionMakerName).toBe("Edmond Scanlon");
    expect(res.body.results[1].id).toBe("b");
  });

  it("marks an individual company FAILED instead of failing the whole batch when enrichment throws", async () => {
    mockGenerateContent
      .mockResolvedValueOnce(geminiJsonResponse(FULL_ENRICHMENT_PAYLOAD))
      .mockRejectedValueOnce(new Error("simulated enrichment failure"));

    const res = await request(app)
      .post("/api/enrich-batch")
      .send({
        companies: [
          { id: "ok", companyName: "Kerry Group PLC", county: "Kerry" },
          { id: "bad", companyName: "Broken Co", county: "Cork" },
        ],
      });

    expect(res.status).toBe(200);
    const okResult = res.body.results.find((r: any) => r.id === "ok");
    const badResult = res.body.results.find((r: any) => r.id === "bad");
    expect(okResult.status).toBe("SUCCESS");
    expect(badResult.status).toBe("FAILED");
    expect(badResult.notes).toMatch(/simulated enrichment failure/i);
  });
});

// Runs last: deliberately exhausts the shared per-IP rate limit budget that
// /api/enrich-single and /api/enrich-batch both draw from (30 req/min),
// using malformed (fast-rejecting, pre-AI-call) requests so it doesn't
// depend on the Gemini mock and doesn't affect the success-path assertions
// in the describe blocks above, which all run first against a fresh budget.
describe("rate limiting (429)", () => {
  it("returns 429 with Retry-After once the shared per-IP budget is exceeded", async () => {
    let last: request.Response | undefined;
    for (let i = 0; i < 40; i++) {
      last = await request(app).post("/api/enrich-single").send({});
      if (last.status === 429) break;
    }

    expect(last?.status).toBe(429);
    expect(last?.body.error).toMatch(/rate limit exceeded/i);
    expect(last?.headers["retry-after"]).toBeDefined();
    expect(last?.headers["x-ratelimit-limit"]).toBe("30");
  });
});
