// Singing mode: Tomo and the person sing a duet. The realtime session writes lyric lines;
// Higgs TTS renders them as actual singing via Boson's inline style tag.
import { relationshipStage } from './petLogic.js';

export const SINGING_TAG = '<|style:singing|>';
export const MAX_LYRIC_CHARS = 400;
export const TTS_MODEL = 'higgs-tts-3';
export const PRESET_VOICES = Object.freeze(['default', 'chloe', 'eleanor', 'jake', 'marcus', 'nora', 'oliver']);
// Measured against Boson's own singing sample: the "default" voice ignores <|style:singing|> and
// delivers spoken word (notes sustained ~20% of the time); eleanor/jake/nora genuinely sing (~80-85%).
export const SINGING_VOICE = 'eleanor';
export const MAX_SING_SECONDS = 20; // repeated syllables can make the model loop for over a minute
// Documented Boson delivery tags that may be layered in front of the singing tag.
export const EXTRA_TAGS = Object.freeze([
  'emotion:elation', 'emotion:amusement', 'emotion:enthusiasm', 'emotion:contentment', 'emotion:affection',
  'emotion:longing', 'emotion:sadness', 'prosody:pitch_high', 'prosody:pitch_low', 'prosody:speed_slow',
  'prosody:speed_very_slow', 'prosody:expressive_high', 'sfx:humming',
]);

// Build the TTS delivery options from a request body, rejecting anything outside the documented sets.
export function singingOptions(body = {}) {
  const voice = body.voice ?? SINGING_VOICE;
  if (!PRESET_VOICES.includes(voice)) throw new Error('unknown voice');
  const tags = Array.isArray(body.tags) ? body.tags : [];
  if (tags.some((t) => !EXTRA_TAGS.includes(t))) throw new Error('unknown delivery tag');
  const normalize = body.normalize === undefined ? true : Boolean(body.normalize);
  return { voice, prefix: tags.map((t) => `<|${t}|>`).join(''), normalize };
}

// Persona for the realtime session while singing mode is on. Text output only — the words are
// sung by TTS, so the model must hand back bare lyric lines and nothing else.
export function singingInstructions(pet) {
  const stage = relationshipStage(pet.bond);
  return [
    `You are ${pet.name}, a small luminous creature who lives on this person's screen, and right now you are singing a duet with them.`,
    `Relationship stage: ${stage}. Mood ${pet.mood}/100, energy ${pet.energy}/100.`,
    'Reply ONLY with the next one or two short lyric lines for you to sing (at most 25 words).',
    'No talking, no greetings, no quotes, no stage directions, no emoji, no notes about the song.',
    'Avoid long runs of repeated syllables like la-la-la. Keep a steady rhyme and a simple, catchy rhythm. Match the person\'s mood and what they just sang; build on their words.',
    'After your lines, stop and wait — the person sings the next lines. Never sing more than two lines in a row.',
  ].join(' ');
}

// Cap a 16-bit PCM WAV at maxSeconds, rewriting the RIFF/data sizes. Returns the input if short enough.
export function trimWav(buffer, maxSeconds) {
  if (buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF') return buffer;
  const channels = buffer.readUInt16LE(22);
  const rate = buffer.readUInt32LE(24);
  const bytesPerSample = buffer.readUInt16LE(34) / 8;
  const dataBytes = buffer.readUInt32LE(40);
  const maxBytes = Math.floor(maxSeconds * rate) * channels * bytesPerSample;
  if (dataBytes <= maxBytes) return buffer;
  const trimmed = Buffer.from(buffer.subarray(0, 44 + maxBytes));
  trimmed.writeUInt32LE(36 + maxBytes, 4);
  trimmed.writeUInt32LE(maxBytes, 40);
  return trimmed;
}

// Clean a lyric line and prefix Boson's singing control tag. Throws on anything unsingable.
export function singingInput(text) {
  if (typeof text !== 'string') throw new Error('lyric must be text');
  const cleaned = text
    .replace(/\([^)]*\)|\[[^\]]*\]/g, '') // (softly), [chorus]
    .replace(/["“”]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) throw new Error('lyric is empty');
  if (cleaned.length > MAX_LYRIC_CHARS) throw new Error('lyric is too long to sing');
  return `${SINGING_TAG}${cleaned}`;
}
