import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface SplitPlan {
  name: string;
  startPage: number;
  endPage: number;
}

export async function analyzePdfSplits(pagesText: { page: number, text: string }[]): Promise<SplitPlan[]> {
  const prompt = `
    Analyze the following text extracted from a multi-page PDF document containing tax returns (or similar documents) for multiple employees/people.
    Identify the start and end pages for each person's document.
    Return a JSON array of objects, where each object has:
    - name: The full name of the person.
    - startPage: The starting page number (1-indexed).
    - endPage: The ending page number (1-indexed).
    
    Here is the text per page:
    ${pagesText.map(p => `--- Page ${p.page} ---\n${p.text}`).join('\n\n')}
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING, description: "Full name of the person" },
            startPage: { type: Type.INTEGER, description: "Starting page number" },
            endPage: { type: Type.INTEGER, description: "Ending page number" }
          },
          required: ["name", "startPage", "endPage"]
        }
      }
    }
  });

  return JSON.parse(response.text || '[]');
}
