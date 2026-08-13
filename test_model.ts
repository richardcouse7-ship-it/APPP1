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
  await run("gemini-1.5-flash");
  await run("gemini-2.5-flash");
  await run("gemini-2.5-flash-8b");
  await run("gemini-1.5-flash-8b");
}
testAll();
