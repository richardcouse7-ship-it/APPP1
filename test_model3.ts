import { GoogleGenAI } from "@google/genai";
async function run(model: string) {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    await ai.models.generateContent({
      model: model,
      contents: "hello",
    });
    console.log(model, "generateContent WORKS");
  } catch(e) {
    console.log(model, "generateContent FAILS", e.message);
  }
}
async function runInteraction(model: string) {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const res = await ai.interactions.create({
      model: model,
      input: "hello",
    });
    console.log(model, "interactions WORKS");
  } catch(e) {
    console.log(model, "interactions FAILS", e.message);
  }
}
async function testAll() {
  await run("gemini-3.6-flash");
  await runInteraction("gemini-3.6-flash");
}
testAll();
