
import { GoogleGenAI, Type } from "@google/genai";

/**
 * Utility to perform API calls with exponential backoff for 429 errors.
 */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, initialDelay = 2000): Promise<T> {
  let delay = initialDelay;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      const errStr = error.message || JSON.stringify(error);
      const isQuotaError = errStr.includes("429") || errStr.includes("quota") || errStr.includes("RESOURCE_EXHAUSTED");
      
      if (isQuotaError && i < maxRetries - 1) {
        console.warn(`Quota exceeded. Retrying in ${delay}ms... (Attempt ${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
        continue;
      }
      throw error;
    }
  }
  return fn(); // Final attempt
}

/**
 * Neural Suggestion Engine
 */
export async function getFieldSuggestion(field: string, currentValue: string, context: any): Promise<string> {
  return withRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
    const systemInstruction = `
      You are the SoundWeave Neural Suggestion Engine.
      Context:
      - User Mode: ${context.mode}
      - Field: ${field}
      - Current Progress: ${JSON.stringify(context)}

      Task:
      - If empty (Generate Mode): Produce a high-quality, professional, and evocative suggestion.
      - If filled (Enhance Mode): Refine the user's input for clarity and emotional weight.
      
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
  });
}

/**
 * Creative Intent Interpreter
 */
export async function interpretIntent(project: any) {
  return withRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
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
  });
}

/**
 * Visual Synthesis (Veo)
 */
export async function generateVeoVideo(style: string, genre: string, prompt: string): Promise<string> {
  // Veo operations involve polling, so we don't retry the initiation here
  // unless the initial request itself fails with 429.
  return withRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
    
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
    
    if (!response.ok) {
       const errorBody = await response.text();
       if (errorBody.includes("Requested entity was not found")) {
          throw new Error("KEY_RESET_REQUIRED");
       }
       throw new Error("Video download failed: " + response.statusText);
    }
    
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  });
}
