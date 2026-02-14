
import { GoogleGenAI, Type } from "@google/genai";

const getAi = () => new GoogleGenAI({ apiKey: process.env.API_KEY as string });

/**
 * Neural Suggestion Engine
 * Explicitly differentiates between 'Generate' (empty) and 'Enhance' (filled)
 */
export async function getFieldSuggestion(field: string, currentValue: string, context: any): Promise<string> {
  const ai = getAi();
  
  const systemInstruction = `
    You are the SoundWeave Neural Suggestion Engine.
    Context:
    - User Mode: ${context.mode}
    - Field: ${field}
    - Current Progress: ${JSON.stringify(context)}

    Task:
    - If empty (Generate Mode): Produce a high-quality, professional, and evocative suggestion that fits the existing context.
    - If filled (Enhance Mode): Refine the user's input for clarity, professional music production terminology, and emotional weight. Do NOT change the user's original core intent.
    
    Constraint: Return ONLY the text suggestion. No intros, no quotes, no explanations.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Suggestion for "${field}". Current value: "${currentValue}"`,
    config: {
      systemInstruction,
      temperature: 0.8,
    }
  });

  return response.text.trim();
}

/**
 * Creative Intent Interpreter
 * Analyzes project parameters to build high-level production metadata.
 * Uses gemini-3-flash-preview for high reliability and lower quota pressure.
 */
export async function interpretIntent(project: any) {
  const ai = getAi();
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Analyze this music production intent and return strictly valid JSON: ${JSON.stringify(project)}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          mood: { type: Type.STRING, description: "One word mood descriptor" },
          energyLevel: { type: Type.NUMBER, description: "0-100 scale" },
          atmosphere: { type: Type.STRING },
          technicalNotes: { type: Type.STRING, description: "Brief production notes for the synthesizer" }
        },
        required: ["mood", "energyLevel", "technicalNotes"]
      }
    }
  });
  
  return JSON.parse(response.text.trim());
}

/**
 * Visual Synthesis (Veo)
 * Generates cinematic visuals based on music style.
 */
export async function generateVeoVideo(style: string, genre: string, prompt: string): Promise<string> {
  const ai = getAi();
  
  let operation = await ai.models.generateVideos({
    model: 'veo-3.1-fast-generate-preview',
    prompt: `Cinematic visual for ${genre} music. Style: ${style}. Concept: ${prompt}. Professional, high fidelity, 4k texture, immersive environment.`,
    config: {
      numberOfVideos: 1,
      resolution: '720p',
      aspectRatio: '16:9'
    }
  });

  while (!operation.done) {
    await new Promise(resolve => setTimeout(resolve, 8000));
    operation = await ai.operations.getVideosOperation({ operation: operation });
  }

  const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
  const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}
