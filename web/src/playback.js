// Gapless PCM16 playback queue over Web Audio, with instant flush for barge-in.
const LEAD_SECONDS = 0.05; // small lead so the first chunk never starts in the past

const floatFromInt16 = (i16) => {
  const f32 = new Float32Array(i16.length);
  for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 0x8000;
  return f32;
};

export const createPlaybackQueue = (ctx, sampleRate) => {
  let tailTime = 0;            // when the last scheduled chunk ends
  let pending = new Set();     // sources still scheduled or playing

  const enqueue = (i16) => {
    const f32 = floatFromInt16(i16);
    const buffer = ctx.createBuffer(1, f32.length, sampleRate);
    buffer.getChannelData(0).set(f32);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    const startAt = Math.max(ctx.currentTime + LEAD_SECONDS, tailTime);
    src.onended = () => { pending.delete(src); };
    src.start(startAt);
    tailTime = startAt + buffer.duration;
    pending = new Set([...pending, src]);
  };

  const flush = () => {
    for (const src of pending) {
      try { src.stop(); } catch { /* already ended */ }
    }
    pending = new Set();
    tailTime = 0;
  };

  const remainingMs = () => Math.max(0, (tailTime - ctx.currentTime) * 1000);

  return { enqueue, flush, remainingMs };
};
