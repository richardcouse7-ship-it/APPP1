import { GoogleGenAI } from "@google/genai";
async function run() {
  const model = "gemini-3.6-flash";
  const start = Date.now();
  const companyName = "HAMMY BROS LIMITED";
  const county = "Galway";
  const prompt = `You are an expert Irish B2B Lead Research Analyst and Web Intelligence Extraction Agent.

YOUR TASK:
For this Irish business:
Business Name: "${companyName}"
County/Location: "${county}"


1. CONDUCT B2B LEAD RESEARCH & WEBSITE VERIFICATION (focusing on contact and DM info):
   - Official Website URL: Search for and identify the official, primary website domain URL.
   - Industry / Sector: Determine business sector (e.g. Dairy & Agriculture, Food & Beverage, Construction, Software & Tech, Retail, Logistics).
   - Company Summary: Write a concise 1-2 sentence overview of what the company does based on their website or web footprint.
   - Key Decision Maker (DM): Identify CEO, Managing Director, Founder, Owner, or top executive (Full Name e.g. "John Murphy").
   - Decision Maker Role: Their official title/role (e.g. "Managing Director", "Chief Executive Officer", "Owner", "Founder").
   - LinkedIn Research (Priority Fallback Order):
     1. Search for Key Decision Maker's personal LinkedIn profile URL
     2. Fallback: If no personal decision maker LinkedIn page is found, search for official Business / Company LinkedIn page
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
  "notes": "<1_SENTENCE_RESEARCH_NOTES>"
}`;

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        temperature: 0.1,
      }
    });
    console.log(model, "generateContent WORKS in", Date.now() - start, "ms");
  } catch(e) {
    console.log(model, "generateContent FAILS", e.message, "in", Date.now() - start, "ms");
  }
}
run();
