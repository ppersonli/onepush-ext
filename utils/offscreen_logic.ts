console.log('[Pixiaoli Offscreen] Offscreen document loaded.');

browser.runtime.onMessage.addListener((message: any) => {
  if (message?.type === 'GET_VIDEO_PLATFORMS_FROM_LOCALSTORAGE') {
    const requestId = message.payload?.requestId as string | undefined;
    const key = (message.payload?.key as string | undefined) ?? 'pixiaoli:video-platforms';
    try {
      const raw = window.localStorage.getItem(key);
      console.log('[Pixiaoli Offscreen] Read localStorage key:', key, 'raw length:', raw ? raw.length : 0);
      let platforms: string[] = [];
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, boolean>;
        if (parsed && typeof parsed === 'object') {
          platforms = Object.keys(parsed).filter((k) => !!(parsed as any)[k]);
        }
      }
      console.log('[Pixiaoli Offscreen] Loaded platforms from localStorage:', platforms);
      browser.runtime.sendMessage({
        type: 'VIDEO_PLATFORMS_FROM_LOCALSTORAGE',
        payload: { requestId, platforms },
      });
    } catch (e) {
      console.warn('[Pixiaoli Offscreen] Failed to load platforms from localStorage:', e);
      browser.runtime.sendMessage({
        type: 'VIDEO_PLATFORMS_FROM_LOCALSTORAGE',
        payload: { requestId, platforms: [] },
      });
    }
    return;
  }
  if (message.type === 'GENERATE_MP4_FROM_IMAGES') {
    const { taskId, imageUrls, encode, audio, audioSource } = message.payload || {};
    const urlCount = Array.isArray(imageUrls) ? imageUrls.length : 0;
    console.log('[Pixiaoli Offscreen] GENERATE_MP4_FROM_IMAGES received, image count:', urlCount);
    generateMp4FromImages(imageUrls, encode, audio, audioSource)
      .then((blobUrl) => {
        console.log('[Pixiaoli Offscreen] MP4 generated successfully');
        browser.runtime.sendMessage({
          type: 'VIDEO_GENERATED',
          payload: { taskId, blobUrl },
        });
      })
      .catch((err) => {
        const errMsg = err?.message ?? String(err);
        const errStack = err?.stack;
        console.error('[Pixiaoli Offscreen] Error generating mp4:', errMsg, errStack ?? '');
        browser.runtime.sendMessage({
          type: 'VIDEO_GENERATION_FAILED',
          payload: { taskId, error: errMsg, stack: errStack },
        });
      });
  }
});

async function generateMp4FromImages(
  imageUrls: string[],
  encode: { width: number; height: number; fps: number; durationPerImageMs: number } | undefined,
  audio: { enabled?: boolean; loop?: boolean; volume?: number } | undefined,
  audioSource: { name: string; mime: string; base64: string } | undefined,
): Promise<string> {
  if (!imageUrls || imageUrls.length === 0) {
    throw new Error('No images provided.');
  }
  console.log('[Pixiaoli Offscreen] Loading mp4-muxer...');
  const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');
  console.log('[Pixiaoli Offscreen] Creating canvas/encoder, size:', encode?.width ?? 1080, 'x', encode?.height ?? 1920);

  const width = Math.max(16, Math.floor(encode?.width ?? 1080));
  const height = Math.max(16, Math.floor(encode?.height ?? 1920));
  const fps = Math.max(1, Math.min(60, Math.floor(encode?.fps ?? 30)));
  const durationPerImageMs = Math.max(200, Math.floor(encode?.durationPerImageMs ?? 3000));

  const canvas = document.getElementById('canvas') as HTMLCanvasElement | null;
  if (!canvas) throw new Error('Canvas element not found in offscreen document.');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2d context.');

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    // Required by mp4-muxer typings; ensures moov is at file start.
    fastStart: 'in-memory',
    video: {
      codec: 'avc',
      width,
      height,
    },
    audio:
      audio?.enabled === false
        ? undefined
        : {
            codec: 'aac',
            sampleRate: 48_000,
            numberOfChannels: 1,
          },
  });

  let videoEncoder: VideoEncoder | null = null;
  let audioEncoder: AudioEncoder | null = null;
  let videoEncoderError: Error | null = null;
  try {
    const chunksAdded: { count: number } = { count: 0 };

    videoEncoder = new VideoEncoder({
      output: (chunk, meta) => {
        muxer.addVideoChunk(chunk, meta);
        chunksAdded.count += 1;
      },
      error: (e) => {
        console.error('[Pixiaoli Offscreen] VideoEncoder error:', e);
        videoEncoderError = e instanceof Error ? e : new Error(String(e));
      },
    });

    // Main profile, Level 4.0：支持 1080×1920 等竖屏分辨率（Level 3.0 最大约 414k 像素，不够）
    videoEncoder.configure({
      codec: 'avc1.4D4028',
      width,
      height,
      bitrate: 4_000_000,
      framerate: fps,
    });

    const frameDurationUs = Math.floor(1_000_000 / fps);
    const framesPerImage = Math.max(1, Math.round((durationPerImageMs * 1000) / frameDurationUs));

    let timestampUs = 0;
    for (let i = 0; i < imageUrls.length; i++) {
      if (videoEncoderError) break;
      const imgUrl = imageUrls[i];
      const bitmap = await fetchImageBitmap(imgUrl);
      if (!bitmap) continue;

      // Cover-fit: preserve aspect ratio, crop center.
      drawCover(ctx, bitmap, width, height);
      bitmap.close();

      for (let f = 0; f < framesPerImage; f++) {
        if (videoEncoderError) break;
        const frame = new VideoFrame(canvas, { timestamp: timestampUs });
        const isKeyFrame = chunksAdded.count === 0 || (chunksAdded.count % (fps * 2) === 0);
        videoEncoder.encode(frame, { keyFrame: isKeyFrame });
        frame.close();
        timestampUs += frameDurationUs;
      }
    }

    if (videoEncoderError) throw videoEncoderError;
    await videoEncoder.flush();

    // Add AAC track: prefer user-selected audio; fallback to silence (keeps platform compatibility).
    if (audio?.enabled !== false) {
      const sampleRate = 48_000;
      const numberOfChannels = 1;
      const framesPerChunk = 1024;
      const totalDurationUs = timestampUs;
      const totalSamples = Math.ceil((totalDurationUs / 1_000_000) * sampleRate);

      audioEncoder = new AudioEncoder({
        output: (chunk, meta) => {
          muxer.addAudioChunk(chunk, meta);
        },
        error: (e) => {
          console.error('[Pixiaoli Offscreen] AudioEncoder error:', e);
        },
      });
      audioEncoder.configure({
        codec: 'mp4a.40.2',
        sampleRate,
        numberOfChannels,
        bitrate: 128_000,
      });

      const volume = typeof audio?.volume === 'number' ? Math.max(0, Math.min(2, audio.volume)) : 1;
      const pcm = audioSource?.base64
        ? await decodeAudioToMonoPcm(audioSource.base64, sampleRate, totalSamples, audio?.loop !== false, volume)
        : new Float32Array(totalSamples); // silence

      let samplesEncoded = 0;
      while (samplesEncoded < totalSamples) {
        const frames = Math.min(framesPerChunk, totalSamples - samplesEncoded);
        // Copy to a fresh ArrayBuffer to satisfy AudioData typing (BufferSource expects ArrayBuffer).
        const data = new Float32Array(frames);
        data.set(pcm.subarray(samplesEncoded, samplesEncoded + frames));
        const ad = new AudioData({
          format: 'f32',
          sampleRate,
          numberOfFrames: frames,
          numberOfChannels,
          timestamp: Math.floor((samplesEncoded / sampleRate) * 1_000_000),
          data,
        });
        audioEncoder.encode(ad);
        ad.close();
        samplesEncoded += frames;
      }
      await audioEncoder.flush();
    }

    muxer.finalize();

    const buffer = target.buffer as ArrayBuffer;
    const blob = new Blob([buffer], { type: 'video/mp4' });
    return URL.createObjectURL(blob);
  } finally {
    try {
      videoEncoder?.close();
    } catch {
      // ignore
    }
    try {
      audioEncoder?.close();
    } catch {
      // ignore
    }
  }
}

async function fetchImageBitmap(url: string): Promise<ImageBitmap | null> {
  try {
    const isDataUrl = url.startsWith('data:');
    const res = await fetch(url, isDataUrl ? { cache: 'no-store' } : { mode: 'cors', cache: 'no-store' });
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
    const blob = await res.blob();
    return await createImageBitmap(blob);
  } catch (e) {
    console.warn('[Pixiaoli Offscreen] Failed to fetch image:', url, e);
    return null;
  }
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  bitmap: ImageBitmap,
  width: number,
  height: number,
) {
  const srcW = bitmap.width;
  const srcH = bitmap.height;
  if (srcW <= 0 || srcH <= 0) return;

  const scale = Math.max(width / srcW, height / srcH);
  const drawW = Math.ceil(srcW * scale);
  const drawH = Math.ceil(srcH * scale);
  const dx = Math.floor((width - drawW) / 2);
  const dy = Math.floor((height - drawH) / 2);

  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(bitmap, dx, dy, drawW, drawH);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function decodeAudioToMonoPcm(
  base64: string,
  targetSampleRate: number,
  targetSamples: number,
  loop: boolean,
  volume: number,
): Promise<Float32Array> {
  const buf = base64ToArrayBuffer(base64);
  const ctx = new AudioContext({ sampleRate: targetSampleRate });
  const audioBuffer = await ctx.decodeAudioData(buf.slice(0));

  const ch0 = audioBuffer.getChannelData(0);
  const ch1 = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : null;

  const source = new Float32Array(ch0.length);
  if (ch1) {
    for (let i = 0; i < source.length; i++) {
      source[i] = (ch0[i] + ch1[i]) / 2;
    }
  } else {
    source.set(ch0);
  }

  const out = new Float32Array(targetSamples);
  if (source.length === 0) return out;

  for (let i = 0; i < targetSamples; i++) {
    if (!loop && i >= source.length) break;
    out[i] = source[i % source.length] * volume;
  }

  try {
    await ctx.close();
  } catch {
    // ignore
  }
  return out;
}
