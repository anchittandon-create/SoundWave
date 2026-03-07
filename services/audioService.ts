
/**
 * MuseWave High-Fidelity Audio Synthesis Engine
 * Generates valid WAV files with layered synthesis to provide a "real" musical experience.
 */

export async function generateSynthesizedAudioBlob(durationSeconds: number): Promise<Blob> {
  const sampleRate = 44100;
  const numChannels = 2;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = Math.floor(durationSeconds * byteRate);
  const fileSize = 44 + dataSize;

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

  writeString(view, 0, 'RIFF');
  view.setUint32(4, fileSize - 8, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  const startOffset = 44;
  const totalSamples = Math.floor(durationSeconds * sampleRate);

  // Randomize parameters for unique output every time
  const bpm = 90 + Math.random() * 60; // 90 to 150 BPM
  const beatDuration = 60 / bpm;
  
  const baseFreqs = [30, 40, 50, 60];
  const subFreq = baseFreqs[Math.floor(Math.random() * baseFreqs.length)];
  
  const scales = [
    [220, 261.63, 293.66, 329.63], // A minor
    [261.63, 293.66, 329.63, 349.23], // C major
    [196.00, 220.00, 246.94, 261.63], // G major
    [146.83, 164.81, 174.61, 196.00]  // D minor
  ];
  const notes = scales[Math.floor(Math.random() * scales.length)];
  
  const synthEnvDecay = 2 + Math.random() * 6;
  const noiseEnvDecay = 10 + Math.random() * 20;
  
  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const beatIndex = Math.floor(t / beatDuration);
    const timeInBeat = t % beatDuration;

    const sub = Math.sin(2 * Math.PI * subFreq * t) * 0.4;

    const kickEnv = Math.exp(-timeInBeat * 10);
    const kickFreq = 150 * Math.exp(-timeInBeat * 30);
    const kick = Math.sin(2 * Math.PI * kickFreq * timeInBeat) * kickEnv * 0.5;

    const note = notes[beatIndex % notes.length];
    const synthEnv = Math.exp(-(t % (beatDuration / 2)) * synthEnvDecay);
    const melody = Math.sin(2 * Math.PI * note * t) * synthEnv * 0.2;

    const noise = (Math.random() * 2 - 1) * Math.exp(-timeInBeat * noiseEnvDecay) * 0.1;

    let signal = sub + kick + melody + noise;
    signal = Math.max(-1, Math.min(1, signal * 0.8));
    const sample = signal * 0x7FFF;
    
    const bytePos = startOffset + i * 4;
    if (bytePos + 3 < buffer.byteLength) {
      view.setInt16(bytePos, sample, true);
      view.setInt16(bytePos + 2, sample, true);
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}
