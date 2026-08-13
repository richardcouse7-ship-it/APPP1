import { GoogleGenAI } from "@google/genai";
async function run(model: string) {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    await ai.models.generateContent({
      model: model,
      contents: "hello",
    });
    console.log(model, "WORKS");
  } catch(e) {
    console.log(model, "FAILS", e.message);
  }
}
async function testAll() {
  await run("gemini-2.5-pro");
  await run("gemini-pro");
  await run("gemini-3.0-flash");
}
testAll();
