import { GoogleGenAI } from "@google/genai";
async function run() {
  const model = "gemini-3.6-flash";
  const start = Date.now();
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    await ai.models.generateContent({
      model: model,
      contents: "hello",
      config: {
        tools: [{ googleSearch: {} }],
      }
    });
    console.log(model, "generateContent WORKS in", Date.now() - start, "ms");
  } catch(e) {
    console.log(model, "generateContent FAILS", e.message, "in", Date.now() - start, "ms");
  }
}
run();
