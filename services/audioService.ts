
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

  const bpm = 120;
  const beatDuration = 60 / bpm;
  
  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const beatIndex = Math.floor(t / beatDuration);
    const timeInBeat = t % beatDuration;

    const subFreq = 40;
    const sub = Math.sin(2 * Math.PI * subFreq * t) * 0.4;

    const kickEnv = Math.exp(-timeInBeat * 10);
    const kickFreq = 150 * Math.exp(-timeInBeat * 30);
    const kick = Math.sin(2 * Math.PI * kickFreq * timeInBeat) * kickEnv * 0.5;

    const notes = [220, 261.63, 293.66, 329.63];
    const note = notes[beatIndex % notes.length];
    const synthEnv = Math.exp(-(t % (beatDuration / 2)) * 5);
    const melody = Math.sin(2 * Math.PI * note * t) * synthEnv * 0.2;

    const noise = (Math.random() * 2 - 1) * Math.exp(-timeInBeat * 20) * 0.1;

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
