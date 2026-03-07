
import { GoogleGenAI, Type } from "@google/genai";

// Track session-wide quota status to avoid unnecessary network calls
let isCloudQuotaExhausted = false;

const LOCAL_LIBRARY: Record<string, string[]> = {
  title: [
    "Vaporwave Echoes", "Neon Horizon", "Subterranean Pulse", "Digital Solitude", 
    "Midnight Transmission", "Crystalline Dreams", "Obsidian Flow", "Static Grace",
    "Analog Drift", "Quantum Resonance", "Binary Sunset", "Ethereal Cipher"
  ],
  prompt: [
    "A lush, cinematic soundscape featuring granular synth textures and a driving rhythmic pulse.",
    "Deep, atmospheric house with ethereal vocal chops and a warm analog bassline.",
    "Industrial techno with distorted percussion, metallic resonance, and dark ambient layers.",
    "Lo-fi jazz fusion with bit-crushed piano, swing-heavy drums, and vinyl crackle.",
    "Cyberpunk orchestral score combining aggressive brass sections with glitchy electronic patterns.",
    "Minimalist ambient with sweeping pads, nature recordings, and distant bell-like melodies."
  ],
  lyrics: [
    "[Verse 1] Digital ghosts in the wires / Chasing the sparks of old fires",
    "[Chorus] We are the sound, we are the light / Weaving through the electric night",
    "[Bridge] Lost in the static, found in the code / Taking the neon-lit road",
    "[Verse 2] Circuits hum a lonely tune / Beneath the light of a silicon moon"
  ],
  videoStyle: [
    "Anamorphic Noir", "Retro-Futuristic VHS", "Abstract Minimalist Geometry", 
    "Biomechanical Surrealism", "Vibrant Cyber-Punk Cityscape", "Liquid Mercury Motion"
  ]
};

/**
 * Executes a call across multiple model tiers before falling back to local.
 */
async function callNeuralTier<T>(
  cloudFn: (model: string) => Promise<T>, 
  fallback: () => T
): Promise<T> {
  if (isCloudQuotaExhausted) return fallback();

  const models = ['gemini-3-flash-preview', 'gemini-flash-lite-latest'];
  
  for (const model of models) {
    try {
      return await cloudFn(model);
    } catch (error: any) {
      const errStr = (error.message || JSON.stringify(error)).toUpperCase();
      const isHardQuota = errStr.includes("429") || errStr.includes("QUOTA") || errStr.includes("RESOURCE_EXHAUSTED");
      
      if (isHardQuota) {
        console.warn(`Model ${model} exhausted. Attempting next tier...`);
        if (model === models[models.length - 1]) {
          isCloudQuotaExhausted = true;
          throw new Error("QUOTA_EXHAUSTED_DAILY");
        }
        continue; // Try next model
      }
      throw error; // Unexpected error
    }
  }
  return fallback();
}

export const getIsCloudExhausted = () => isCloudQuotaExhausted;

/**
 * Neural Suggestion Engine with Multi-Model Fallback
 */
export async function getFieldSuggestion(field: string, currentValue: string, context: any, action: 'new' | 'enhance' = 'new'): Promise<string> {
  const getLocal = () => {
    const baseField = field.includes('_') ? field.split('_').pop()! : field;
    if (baseField === 'genres') return "Ambient, Synthwave";
    if (baseField === 'vocalLangs') return "English";
    if (baseField === 'numSongs') return "5";
    const options = LOCAL_LIBRARY[baseField] || ["New Creative Wave", "Neural Flux"];
    return options[Math.floor(Math.random() * options.length)];
  };

  try {
    return await callNeuralTier(async (modelName) => {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
      let systemInstruction = `You are the SoundWeave Studio assistant. Return ONLY a single text suggestion for the field: ${field}. No quotes.`;
      
      const baseField = field.includes('_') ? field.split('_').pop()! : field;
      if (baseField === 'genres') {
        systemInstruction += ` Choose 1 to 3 genres from: Ambient, Cyberpunk, Deep House, Industrial, Jazz Fusion, Lo-Fi, Neo-Classical, Orchestral, Phonk, Synthwave, Techno. Return as comma-separated list.`;
      } else if (baseField === 'vocalLangs') {
        systemInstruction += ` Choose 1 to 2 languages from: Instrumental, English, Japanese, French, Spanish, German, Korean. Return as comma-separated list.`;
      } else if (baseField === 'numSongs') {
        systemInstruction += ` Return a single number between 2 and 10.`;
      }

      const promptText = action === 'enhance' && currentValue 
        ? `Enhance and improve the following "${field}": "${currentValue}". Context: ${JSON.stringify(context)}`
        : `Generate a new, creative suggestion for "${field}". Context: ${JSON.stringify(context)}`;
        
      const response = await ai.models.generateContent({
        model: modelName,
        contents: promptText,
        config: { systemInstruction, temperature: 0.9 }
      });
      return response.text.trim().replace(/^["']|["']$/g, '');
    }, getLocal);
  } catch (e: any) {
    return getLocal();
  }
}

/**
 * Intent Interpreter with Multi-Model Fallback
 */
export async function interpretIntent(project: any) {
  const getLocal = () => ({
    mood: "Adaptive",
    energyLevel: 70,
    atmosphere: "Studio Default",
    technicalNotes: "Offline local engine active. Using optimized generic synthesis parameters."
  });

  try {
    return await callNeuralTier(async (modelName) => {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
      const response = await ai.models.generateContent({
        model: modelName,
        contents: `Analyze intent JSON: ${JSON.stringify(project)}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              mood: { type: Type.STRING },
              energyLevel: { type: Type.NUMBER },
              technicalNotes: { type: Type.STRING }
            },
            required: ["mood", "energyLevel", "technicalNotes"]
          }
        }
      });
      return JSON.parse(response.text.trim());
    }, getLocal);
  } catch (e: any) {
    return getLocal();
  }
}

/**
 * Visual Synthesis (Veo) - No local fallback for video, but handles quota
 */
export async function generateVeoVideo(style: string, genre: string, prompt: string): Promise<Blob> {
  if (isCloudQuotaExhausted) throw new Error("QUOTA_EXHAUSTED_DAILY");

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
  let operation = await ai.models.generateVideos({
    model: 'veo-3.1-fast-generate-preview',
    prompt: `Style: ${style}. Cinematic ${genre} music visual. ${prompt}`,
    config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '16:9' }
  });

  while (!operation.done) {
    await new Promise(resolve => setTimeout(resolve, 8000));
    operation = await ai.operations.getVideosOperation({ operation: operation });
  }

  const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
  const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
  if (!response.ok) throw new Error("Video Download Error");
  const rawBlob = await response.blob();
  
  // Explicitly set MIME type for cross-browser playback support
  return new Blob([rawBlob], { type: 'video/mp4' });
}
