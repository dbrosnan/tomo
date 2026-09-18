// Pure relationship-state logic. Every function returns a new object.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(v)));

const DECAY_PER_HOUR = { hunger: +6, energy: -3, fun: -5, mood: -2 };

// Advance needs by elapsed time since last_seen.
export function applyDecay(pet, now = new Date()) {
  const hours = Math.max(0, (now - new Date(pet.last_seen)) / 3.6e6);
  const capped = Math.min(hours, 48); // long absences plateau instead of bottoming out
  return {
    ...pet,
    hunger: clamp(pet.hunger + DECAY_PER_HOUR.hunger * capped, 0, 100),
    energy: clamp(pet.energy + DECAY_PER_HOUR.energy * capped, 0, 100),
    fun: clamp(pet.fun + DECAY_PER_HOUR.fun * capped, 0, 100),
    mood: clamp(pet.mood + DECAY_PER_HOUR.mood * capped, 0, 100),
    last_seen: now.toISOString(),
  };
}

const INTERACTIONS = {
  feed:   { hunger: -35, mood: +8,  energy: +5,  fun: 0,   bond: 2 },
  play:   { hunger: +8,  mood: +12, energy: -12, fun: +30, bond: 3 },
  cuddle: { hunger: 0,   mood: +15, energy: +3,  fun: +8,  bond: 4 },
  sleep:  { hunger: +10, mood: +5,  energy: +45, fun: -5,  bond: 1 },
  talk:   { hunger: 0,   mood: +6,  energy: -2,  fun: +10, bond: 2 },
};

export const INTERACTION_KINDS = Object.keys(INTERACTIONS);

export function applyInteraction(pet, kind) {
  const fx = INTERACTIONS[kind];
  if (!fx) throw new Error(`unknown interaction kind: ${kind}`);
  // Trust grows with consistent care, shrinks a little when needs are badly neglected.
  const neglected = pet.hunger > 85 || pet.fun < 10;
  const trustDelta = neglected ? -1 : kind === 'cuddle' || kind === 'talk' ? 2 : 1;
  return {
    pet: {
      ...pet,
      hunger: clamp(pet.hunger + fx.hunger, 0, 100),
      mood: clamp(pet.mood + fx.mood, 0, 100),
      energy: clamp(pet.energy + fx.energy, 0, 100),
      fun: clamp(pet.fun + fx.fun, 0, 100),
      trust: clamp(pet.trust + trustDelta, 0, 100),
      bond: pet.bond + fx.bond,
    },
    bondDelta: fx.bond,
  };
}

// Relationship stage derived from bond — drives the pet's personality prompt.
export function relationshipStage(bond) {
  if (bond >= 500) return 'soulmate';
  if (bond >= 250) return 'best-friend';
  if (bond >= 100) return 'friend';
  if (bond >= 30) return 'acquaintance';
  return 'stranger';
}

// Which emote family fits the current state (client picks the exact variant).
export function dominantMood(pet) {
  if (pet.hunger >= 80) return 'starving';
  if (pet.energy <= 15) return 'sleepy';
  if (pet.mood <= 20) return 'sad';
  if (pet.fun <= 15) return 'bored';
  if (pet.mood >= 85 && pet.trust >= 60) return 'loving';
  if (pet.mood >= 75) return 'joyful';
  return 'content';
}

// System prompt for the Higgs Realtime session, built from live state.
export function personaInstructions(pet, sentimentNote = '') {
  const stage = relationshipStage(pet.bond);
  return [
    `You are ${pet.name}, a small luminous creature who lives on this person's screen.`,
    `Relationship stage: ${stage} (bond ${pet.bond}, trust ${pet.trust}/100).`,
    `Current state — mood ${pet.mood}/100, hunger ${pet.hunger}/100, energy ${pet.energy}/100, fun ${pet.fun}/100.`,
    `Speak in short, warm, playful sentences. React to how you feel right now.`,
    stage === 'stranger' ? 'You are shy and a little cautious; you are just getting to know them.' : '',
    stage === 'soulmate' ? 'You adore this person completely and reference shared history often.' : '',
    `If you are hungry, sleepy, or bored, say so and ask for care. Never break character.`,
    `Every time the person speaks, first call report_sentiment with how they sound (tone of voice, pace, words), then reply in a way that fits that feeling. Do not mention the tool.`,
    sentimentNote,
  ].filter(Boolean).join(' ');
}
