import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;

export async function combineAudioAndVideo(audioBlob: Blob, videoBlob: Blob): Promise<Blob> {
  if (!ffmpeg) {
    ffmpeg = new FFmpeg();
    await ffmpeg.load({
      coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js',
      wasmURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm',
    });
  }

  const audioName = 'audio.wav';
  const videoName = 'video.mp4';
  const outputName = 'output.mp4';

  await ffmpeg.writeFile(audioName, await fetchFile(audioBlob));
  await ffmpeg.writeFile(videoName, await fetchFile(videoBlob));

  // Loop the video and add the audio, stopping when the audio finishes
  await ffmpeg.exec([
    '-stream_loop', '-1',
    '-i', videoName,
    '-i', audioName,
    '-shortest',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '192k',
    outputName
  ]);

  const data = await ffmpeg.readFile(outputName);
  return new Blob([data], { type: 'video/mp4' });
}
