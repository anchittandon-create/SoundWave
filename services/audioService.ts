
/**
 * MuseWave High-Fidelity Audio Synthesis Engine
 * Generates valid WAV files with layered synthesis to provide a "real" musical experience.
 */

export async function generateSynthesizedAudioBlob(durationSeconds: number, vocalsBuffer?: AudioBuffer | null): Promise<Blob> {
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
  
  const baseFreqs = [32.70, 36.71, 41.20, 43.65]; // C1, D1, E1, F1
  const rootFreq = baseFreqs[Math.floor(Math.random() * baseFreqs.length)];
  
  // Pentatonic or minor scales
  const scales = [
    [1, 9/8, 6/5, 4/3, 3/2, 8/5, 9/5, 2], // Minor
    [1, 9/8, 5/4, 4/3, 3/2, 5/3, 15/8, 2], // Major
    [1, 6/5, 4/3, 3/2, 9/5, 2], // Minor Pentatonic
    [1, 9/8, 5/4, 3/2, 5/3, 2]  // Major Pentatonic
  ];
  const scale = scales[Math.floor(Math.random() * scales.length)];
  
  const getFreq = (octave: number, degree: number) => {
    const root = rootFreq * Math.pow(2, octave - 1);
    const ratio = scale[degree % scale.length];
    const octaveShift = Math.floor(degree / scale.length);
    return root * ratio * Math.pow(2, octaveShift);
  };

  const synthEnvDecay = 2 + Math.random() * 6;
  const noiseEnvDecay = 10 + Math.random() * 20;
  
  // LFO parameters
  const lfo1Freq = 0.1 + Math.random() * 0.5; // Slow modulation
  const lfo2Freq = 0.5 + Math.random() * 2.0; // Medium modulation
  
  // Delay buffer for simple echo (e.g., 3/8th note delay)
  const delayTime = beatDuration * 0.75;
  const delaySamples = Math.floor(delayTime * sampleRate);
  const delayBufferL = new Float32Array(delaySamples);
  const delayBufferR = new Float32Array(delaySamples);
  let delayIndex = 0;
  const delayFeedback = 0.4;
  const delayMix = 0.3;

  let vocalDataL: Float32Array | null = null;
  let vocalDataR: Float32Array | null = null;
  if (vocalsBuffer) {
    vocalDataL = vocalsBuffer.getChannelData(0);
    vocalDataR = vocalsBuffer.numberOfChannels > 1 ? vocalsBuffer.getChannelData(1) : vocalDataL;
  }

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const beatIndex = Math.floor(t / beatDuration);
    const timeInBeat = t % beatDuration;
    const barIndex = Math.floor(beatIndex / 4);

    // LFOs
    const lfo1 = Math.sin(2 * Math.PI * lfo1Freq * t);
    const lfo2 = Math.sin(2 * Math.PI * lfo2Freq * t);

    // 1. Kick Drum (4-on-the-floor or breakbeat)
    const isKick = (beatIndex % 4 === 0) || (beatIndex % 4 === 2 && Math.random() > 0.8);
    let kick = 0;
    if (isKick) {
      const kickEnv = Math.exp(-timeInBeat * 15);
      const kickPitchEnv = Math.exp(-timeInBeat * 40);
      const kickFreq = 50 + 150 * kickPitchEnv;
      kick = Math.sin(2 * Math.PI * kickFreq * timeInBeat) * kickEnv * 0.6;
      // Add some distortion to kick
      kick = Math.tanh(kick * 2.0) * 0.5;
    }

    // 2. Bassline (Sidechained to kick)
    const bassDegree = (barIndex % 4 === 3) ? 4 : 0; // Simple progression
    const bassFreq = getFreq(1, bassDegree);
    // FM Bass
    const bassModulator = Math.sin(2 * Math.PI * bassFreq * 2.0 * t) * (1.0 + lfo1 * 0.5);
    let bass = Math.sin(2 * Math.PI * bassFreq * t + bassModulator) * 0.4;
    // Sidechain compression simulation
    const sidechain = 1.0 - Math.exp(-timeInBeat * 10) * (isKick ? 1 : 0);
    bass *= sidechain;

    // 3. Arpeggio / Melody
    const arpSpeed = 4; // 16th notes
    const arpIndex = Math.floor(t / (beatDuration / arpSpeed));
    const timeInArp = t % (beatDuration / arpSpeed);
    
    // Evolving arpeggio pattern
    const arpPattern = [0, 2, 4, 7, 4, 2, 0, -3];
    const noteDegree = arpPattern[arpIndex % arpPattern.length] + bassDegree;
    const arpFreq = getFreq(3, Math.abs(noteDegree));
    
    const arpEnv = Math.exp(-timeInArp * synthEnvDecay * 2);
    // Pluck sound with lowpass filter simulation (using FM)
    const arpModIndex = 2.0 * arpEnv * (1.0 + lfo2 * 0.5);
    const arpModulator = Math.sin(2 * Math.PI * arpFreq * 1.0 * t) * arpModIndex;
    const arp = Math.sin(2 * Math.PI * arpFreq * t + arpModulator) * arpEnv * 0.25;

    // 4. Pad / Drone (Evolving texture)
    const padFreq1 = getFreq(2, bassDegree);
    const padFreq2 = getFreq(2, bassDegree + 2);
    const padFreq3 = getFreq(2, bassDegree + 4);
    
    // Chorus effect on pad
    const pad1 = Math.sin(2 * Math.PI * padFreq1 * t + Math.sin(2 * Math.PI * 0.5 * t) * 0.01);
    const pad2 = Math.sin(2 * Math.PI * padFreq2 * t + Math.sin(2 * Math.PI * 0.6 * t) * 0.01);
    const pad3 = Math.sin(2 * Math.PI * padFreq3 * t + Math.sin(2 * Math.PI * 0.7 * t) * 0.01);
    
    // Slow attack/release for pad based on bar
    const timeInBar = t % (beatDuration * 4);
    const padEnv = Math.sin((timeInBar / (beatDuration * 4)) * Math.PI);
    const pad = (pad1 + pad2 + pad3) / 3 * padEnv * 0.15 * (1.0 + lfo1 * 0.2);

    // 5. Hi-hat / Noise
    const isHat = (arpIndex % 2 === 1);
    let hat = 0;
    if (isHat) {
      const hatEnv = Math.exp(-timeInArp * noiseEnvDecay);
      // High-pass filtered noise simulation
      const rawNoise = Math.random() * 2 - 1;
      hat = rawNoise * hatEnv * 0.05;
    }

    // Mix signals
    const dryL = kick * 0.8 + bass * 0.8 + arp * 0.6 + pad * 0.8 + hat * 0.5;
    const dryR = kick * 0.8 + bass * 0.8 + arp * 0.4 + pad * 0.9 + hat * 0.7; // Slight stereo spread

    // Apply Delay
    const delayedL = delayBufferL[delayIndex];
    const delayedR = delayBufferR[delayIndex];
    
    // Write to delay buffer with feedback
    delayBufferL[delayIndex] = arp * 0.6 + pad * 0.2 + delayedL * delayFeedback;
    delayBufferR[delayIndex] = arp * 0.4 + pad * 0.3 + delayedR * delayFeedback;
    
    delayIndex = (delayIndex + 1) % delaySamples;

    // Final Mix
    let outL = dryL + delayedL * delayMix;
    let outR = dryR + delayedR * delayMix;

    // Mix Vocals
    if (vocalsBuffer && vocalDataL && vocalDataR && i < vocalsBuffer.length) {
      const vocalL = vocalDataL[i] || 0;
      const vocalR = vocalDataR[i] || 0;
      
      // Add vocals to mix and apply a slight ducking to instrumental
      outL = outL * 0.7 + vocalL * 1.2;
      outR = outR * 0.7 + vocalR * 1.2;
    }

    // Soft Clipping / Limiter
    outL = Math.tanh(outL);
    outR = Math.tanh(outR);

    // Convert to 16-bit PCM
    const sampleL = Math.max(-1, Math.min(1, outL)) * 0x7FFF;
    const sampleR = Math.max(-1, Math.min(1, outR)) * 0x7FFF;
    
    const bytePos = startOffset + i * 4;
    if (bytePos + 3 < buffer.byteLength) {
      view.setInt16(bytePos, sampleL, true);
      view.setInt16(bytePos + 2, sampleR, true);
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}
