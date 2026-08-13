import { GoogleGenAI } from "@google/genai";
async function list() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const models = await ai.models.list();
  for (const model of models) {
    if (model.name.includes("flash")) console.log(model.name);
  }
}
list();
