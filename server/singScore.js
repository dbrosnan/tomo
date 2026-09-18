// Judge whether a TTS rendering actually sings. Singing holds notes; speech glides between pitches.
// Measured against Boson's own <|style:singing|> sample: sustain ≈ 0.9 for singing, ≈ 0.1 for speech.
// Renderings are scored and the best of several candidates is played.

export const DRONE_SECONDS = 3;   // a single note held this long is a stuck model, not a melody
export const MIN_SUSTAIN = 0.5;   // below this it is spoken word

const ANALYSIS_RATE = 8000;
const FRAME_SECONDS = 0.04;
const HOP_SECONDS = 0.01;
const F_MIN = 70;
const F_MAX = 600;
const NOTE_TOLERANCE_SEMITONES = 0.6;
const MIN_NOTE_FRAMES = 15;       // 150 ms
const PERIODICITY_THRESHOLD = 0.5;
const SILENCE_FRACTION_OF_PEAK = 0.06;

const semitones = (hz) => 12 * Math.log2(hz / 100);

// 16-bit mono PCM out of a WAV buffer, downsampled to the analysis rate by block averaging.
const pcmFromWav = (wav) => {
  if (wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF') return { samples: new Float32Array(0), rate: ANALYSIS_RATE };
  const channels = wav.readUInt16LE(22);
  const rate = wav.readUInt32LE(24);
  const dataBytes = Math.min(wav.readUInt32LE(40), wav.length - 44);
  const step = Math.max(1, Math.round(rate / ANALYSIS_RATE));
  const frames = Math.floor(dataBytes / (2 * channels));
  const out = new Float32Array(Math.floor(frames / step));
  for (let i = 0; i < out.length; i++) {
    let acc = 0;
    for (let k = 0; k < step; k++) acc += wav.readInt16LE(44 + ((i * step + k) * channels) * 2);
    out[i] = acc / (step * 32768);
  }
  return { samples: out, rate: rate / step };
};

// Autocorrelation pitch per frame; NaN where unvoiced.
const pitchTrack = (samples, rate) => {
  const N = Math.round(FRAME_SECONDS * rate);
  const H = Math.round(HOP_SECONDS * rate);
  const lagMin = Math.floor(rate / F_MAX);
  const lagMax = Math.ceil(rate / F_MIN);
  const sorted = Float32Array.from(samples, Math.abs).sort();
  const peak = (sorted[Math.floor(sorted.length * 0.99)] ?? 0) + 1e-9;
  const track = [];
  for (let start = 0; start + N <= samples.length; start += H) {
    let mean = 0;
    for (let i = 0; i < N; i++) mean += samples[start + i];
    mean /= N;
    let energy = 0;
    const frame = new Float32Array(N);
    for (let i = 0; i < N; i++) { frame[i] = samples[start + i] - mean; energy += frame[i] * frame[i]; }
    if (Math.sqrt(energy / N) < SILENCE_FRACTION_OF_PEAK * peak) { track.push(NaN); continue; }
    let bestLag = 0; let best = 0;
    for (let lag = lagMin; lag <= lagMax && lag < N; lag++) {
      let acc = 0;
      for (let i = 0; i + lag < N; i++) acc += frame[i] * frame[i + lag];
      const r = acc / (energy + 1e-9);
      if (r > best) { best = r; bestLag = lag; }
    }
    track.push(best >= PERIODICITY_THRESHOLD ? rate / bestLag : NaN);
  }
  return track;
};

// Fraction of voiced frames inside held notes, plus the longest note, in seconds.
const noteStats = (track) => {
  let voiced = 0; let sustainedFrames = 0; let longest = 0; let i = 0;
  while (i < track.length) {
    if (Number.isNaN(track[i])) { i++; continue; }
    const base = semitones(track[i]);
    let j = i;
    while (j + 1 < track.length && !Number.isNaN(track[j + 1]) && Math.abs(semitones(track[j + 1]) - base) <= NOTE_TOLERANCE_SEMITONES) j++;
    const len = j - i + 1;
    voiced += len;
    if (len >= MIN_NOTE_FRAMES) sustainedFrames += len;
    longest = Math.max(longest, len);
    i = j + 1;
  }
  return { voiced, sustain: voiced ? sustainedFrames / voiced : 0, longestNote: longest * HOP_SECONDS };
};

export function scoreWav(wav) {
  const { samples, rate } = pcmFromWav(wav);
  const track = pitchTrack(samples, rate);
  const { voiced, sustain, longestNote } = noteStats(track);
  return {
    duration: track.length * HOP_SECONDS,
    voiced: track.length ? voiced / track.length : 0,
    sustain: Number(sustain.toFixed(2)),
    longestNote: Number(longestNote.toFixed(2)),
    drone: longestNote > DRONE_SECONDS,
    sung: sustain >= MIN_SUSTAIN && longestNote <= DRONE_SECONDS,
  };
}

// Best of several scored candidates: any non-drone beats a drone, then higher sustain wins.
export function pickBestRendering(candidates) {
  const rank = (c) => (c.score.drone ? -1 : 0) + c.score.sustain;
  return candidates.reduce((best, c) => (best === null || rank(c) > rank(best) ? c : best), null);
}
