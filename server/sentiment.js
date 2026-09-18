// Sentiment detection for Tomo. Higgs Realtime hears the person's tone of voice and calls the
// `report_sentiment` tool; these pure helpers validate that report and turn it into relationship effects.

export const SENTIMENTS = Object.freeze([
  'joyful', 'excited', 'affectionate', 'content', 'neutral', 'tired', 'anxious', 'sad', 'angry',
]);

const MAX_REASON_CHARS = 140;
const MIN_INTENSITY = 1;
const MAX_INTENSITY = 5;

export const sentimentTool = Object.freeze({
  type: 'function',
  name: 'report_sentiment',
  description:
    'Report how the person sounds right now, judged from their tone of voice and words. ' +
    'Call this once, before you reply, every time the person has just spoken to you.',
  parameters: {
    type: 'object',
    properties: {
      sentiment: { type: 'string', enum: SENTIMENTS, description: 'Closest label for how they sound.' },
      intensity: { type: 'integer', minimum: MIN_INTENSITY, maximum: MAX_INTENSITY, description: '1 = faint, 5 = unmistakable.' },
      reason: { type: 'string', description: 'A few words on what gave it away (pace, pitch, wording).' },
    },
    required: ['sentiment', 'intensity'],
  },
});

// Validate the raw JSON string Boson sends as tool arguments. Throws on anything off-spec.
export function parseSentiment(argumentsJson) {
  let raw;
  try {
    raw = JSON.parse(argumentsJson);
  } catch {
    throw new Error('sentiment arguments are not valid JSON');
  }
  const sentiment = String(raw?.sentiment ?? '').toLowerCase();
  if (!SENTIMENTS.includes(sentiment)) throw new Error(`unknown sentiment "${sentiment}"`);
  const intensity = Number(raw.intensity);
  if (!Number.isInteger(intensity) || intensity < MIN_INTENSITY || intensity > MAX_INTENSITY) {
    throw new Error('intensity must be an integer from 1 to 5');
  }
  const reason = raw.reason == null ? undefined : String(raw.reason);
  if (reason !== undefined && reason.length > MAX_REASON_CHARS) throw new Error('reason is too long');
  return reason === undefined ? { sentiment, intensity } : { sentiment, intensity, reason };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(v)));

// Per-point-of-intensity effects. Positive feelings are shared; hard feelings are met with care,
// which costs Tomo a little cheer but deepens trust.
const EFFECTS = {
  joyful:       { kind: 'uplift',  mood: +2, fun: +1, trust: 0,  bond: 1 },
  excited:      { kind: 'uplift',  mood: +2, fun: +2, trust: 0,  bond: 1 },
  affectionate: { kind: 'uplift',  mood: +2, fun: 0,  trust: +1, bond: 1 },
  content:      { kind: 'uplift',  mood: +1, fun: 0,  trust: 0,  bond: 0.5 },
  neutral:      { kind: 'steady',  mood: 0,  fun: 0,  trust: 0,  bond: 0 },
  tired:        { kind: 'comfort', mood: -0.5, fun: 0, trust: +1, bond: 0.5 },
  anxious:      { kind: 'comfort', mood: -1, fun: 0,  trust: +1, bond: 0.5 },
  sad:          { kind: 'comfort', mood: -1, fun: 0,  trust: +1, bond: 0.5 },
  angry:        { kind: 'comfort', mood: -1, fun: -1, trust: +0.5, bond: 0.5 },
};

export function applySentiment(pet, { sentiment, intensity }) {
  const fx = EFFECTS[sentiment];
  if (!fx) throw new Error(`unknown sentiment "${sentiment}"`);
  const scale = intensity;
  const bondDelta = Math.max(1, Math.round(fx.bond * scale)); // any shared feeling counts a little
  return {
    pet: {
      ...pet,
      mood: clamp(pet.mood + fx.mood * scale, 0, 100),
      fun: clamp(pet.fun + fx.fun * scale, 0, 100),
      trust: clamp(pet.trust + fx.trust * scale, 0, 100),
      bond: pet.bond + bondDelta,
    },
    effects: { kind: fx.kind, bondDelta },
  };
}

// One line for the persona prompt describing how the person has sounded lately (newest first).
export function sentimentContext(recent) {
  if (!recent?.length) return '';
  const words = recent.slice(0, 5).map((r) => (r.intensity >= 4 ? `very ${r.sentiment}` : r.sentiment));
  return `Lately your person has sounded: ${words.join(', ')} (newest first). Let that shape your tone.`;
}
