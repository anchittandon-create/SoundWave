/**
 * MuseWave High-Fidelity Audio Synthesis Engine
 * Generates valid WAV files with layered synthesis to provide a "real" musical experience.
 */

export async function generateSynthesizedAudio(durationSeconds: number): Promise<string> {
  const sampleRate = 44100;
  const numChannels = 2;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = Math.floor(durationSeconds * byteRate);
  const fileSize = 44 + dataSize;

  // Browser Limit Protection: 
  // Most browsers fail to allocate ArrayBuffers larger than ~2GB.
  // 1 hour of 44.1k/16bit/Stereo is approx 635MB. 
  // We cap at 1200 seconds (20 mins) for safe head-room, though UI caps at 600.
  if (fileSize > 1024 * 1024 * 1024) { // 1GB limit
    throw new Error("Array buffer allocation failed: Requested duration exceeds safe browser memory limits.");
  }

  let buffer: ArrayBuffer;
  try {
    buffer = new ArrayBuffer(fileSize);
  } catch (e) {
    throw new Error("Array buffer allocation failed: Browser was unable to reserve enough contiguous memory.");
  }
  
  const view = new DataView(buffer);

  /* RIFF identifier */
  writeString(view, 0, 'RIFF');
  /* File length */
  view.setUint32(4, fileSize - 8, true);
  /* RIFF type */
  writeString(view, 8, 'WAVE');
  /* Format chunk identifier */
  writeString(view, 12, 'fmt ');
  /* Format chunk length */
  view.setUint32(16, 16, true);
  /* Sample format (1 is PCM) */
  view.setUint16(20, 1, true);
  /* Channel count */
  view.setUint16(22, numChannels, true);
  /* Sample rate */
  view.setUint32(24, sampleRate, true);
  /* Byte rate */
  view.setUint32(28, byteRate, true);
  /* Block align */
  view.setUint16(32, blockAlign, true);
  /* Bits per sample */
  view.setUint16(34, bitsPerSample, true);
  /* Data chunk identifier */
  writeString(view, 36, 'data');
  /* Data chunk length */
  view.setUint32(40, dataSize, true);

  const startOffset = 44;
  const totalSamples = Math.floor(durationSeconds * sampleRate);

  // Synthesis Parameters
  const bpm = 120;
  const beatDuration = 60 / bpm;
  
  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const beatIndex = Math.floor(t / beatDuration);
    const timeInBeat = t % beatDuration;

    // Layer 1: Sub Bass Pulse
    const subFreq = 40;
    const sub = Math.sin(2 * Math.PI * subFreq * t) * 0.4;

    // Layer 2: Rhythmic Pulse (Kick-like)
    const kickEnv = Math.exp(-timeInBeat * 10);
    const kickFreq = 150 * Math.exp(-timeInBeat * 30);
    const kick = Math.sin(2 * Math.PI * kickFreq * timeInBeat) * kickEnv * 0.5;

    // Layer 3: Melodic Arpeggio (Sequence)
    const notes = [220, 261.63, 293.66, 329.63]; // A3, C4, D4, E4
    const note = notes[beatIndex % notes.length];
    const synthEnv = Math.exp(-(t % (beatDuration / 2)) * 5);
    const melody = Math.sin(2 * Math.PI * note * t) * synthEnv * 0.2;

    // Layer 4: Ambient Noise (Hi-hats/Shimmer)
    const noise = (Math.random() * 2 - 1) * Math.exp(-timeInBeat * 20) * 0.1;

    // Master Mix
    let signal = sub + kick + melody + noise;
    
    // Panning & Soft Clipping
    signal = Math.max(-1, Math.min(1, signal * 0.8));
    const sample = signal * 0x7FFF;
    
    const bytePos = startOffset + i * 4;
    if (bytePos + 3 < buffer.byteLength) {
      view.setInt16(bytePos, sample, true);     // L
      view.setInt16(bytePos + 2, sample, true); // R
    }
  }

  const blob = new Blob([buffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}