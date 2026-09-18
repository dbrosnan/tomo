// Parametric emote engine: 25 expression archetypes x 10 effect variants = 250 unique emotes.
// Every emote is a frozen parameter set the renderer can draw directly.

// eyes: round | arc | closed | line | wide | star | heart | spiral | teary | angry
// mouth: smile | grin | open | frown | wavy | cat | oh | flat | pout | drool
export const ARCHETYPES = Object.freeze({
  joyful:      { eyes: 'arc',    mouth: 'grin',  brows: 0.2,  blush: 0.5, tint: 0xffd9a8, bounce: 1.2 },
  ecstatic:    { eyes: 'star',   mouth: 'open',  brows: 0.4,  blush: 0.7, tint: 0xffc46b, bounce: 1.6 },
  content:     { eyes: 'round',  mouth: 'smile', brows: 0.0,  blush: 0.3, tint: 0xffe9c9, bounce: 1.0 },
  loving:      { eyes: 'heart',  mouth: 'smile', brows: 0.1,  blush: 0.9, tint: 0xffb3c1, bounce: 1.1 },
  adoring:     { eyes: 'heart',  mouth: 'cat',   brows: 0.3,  blush: 1.0, tint: 0xff9eb5, bounce: 1.3 },
  playful:     { eyes: 'arc',    mouth: 'cat',   brows: 0.2,  blush: 0.4, tint: 0xc9f0ff, bounce: 1.4 },
  mischievous: { eyes: 'line',   mouth: 'cat',   brows: -0.3, blush: 0.2, tint: 0xd9c9ff, bounce: 1.2 },
  curious:     { eyes: 'wide',   mouth: 'oh',    brows: 0.5,  blush: 0.2, tint: 0xd6f5d6, bounce: 0.9 },
  surprised:   { eyes: 'wide',   mouth: 'oh',    brows: 0.8,  blush: 0.3, tint: 0xfff3b0, bounce: 1.1 },
  amazed:      { eyes: 'star',   mouth: 'oh',    brows: 0.7,  blush: 0.4, tint: 0xffe08a, bounce: 1.2 },
  shy:         { eyes: 'closed', mouth: 'wavy',  brows: 0.1,  blush: 1.0, tint: 0xffc9d6, bounce: 0.8 },
  proud:       { eyes: 'closed', mouth: 'grin',  brows: 0.3,  blush: 0.3, tint: 0xfff0c9, bounce: 1.1 },
  dreamy:      { eyes: 'closed', mouth: 'smile', brows: 0.0,  blush: 0.5, tint: 0xe0d4ff, bounce: 0.7 },
  sleepy:      { eyes: 'line',   mouth: 'flat',  brows: -0.1, blush: 0.1, tint: 0xc9d4e8, bounce: 0.5 },
  dozing:      { eyes: 'closed', mouth: 'drool', brows: 0.0,  blush: 0.1, tint: 0xb8c6de, bounce: 0.3 },
  hungry:      { eyes: 'round',  mouth: 'drool', brows: 0.2,  blush: 0.2, tint: 0xf5e3c9, bounce: 0.9 },
  starving:    { eyes: 'spiral', mouth: 'wavy',  brows: 0.4,  blush: 0.0, tint: 0xd9cdbf, bounce: 0.6 },
  bored:       { eyes: 'line',   mouth: 'flat',  brows: -0.2, blush: 0.0, tint: 0xd4d4d4, bounce: 0.6 },
  sad:         { eyes: 'round',  mouth: 'frown', brows: -0.5, blush: 0.1, tint: 0xb8c9e8, bounce: 0.5 },
  teary:       { eyes: 'teary',  mouth: 'frown', brows: -0.6, blush: 0.2, tint: 0xa8bce0, bounce: 0.4 },
  crying:      { eyes: 'teary',  mouth: 'wavy',  brows: -0.7, blush: 0.3, tint: 0x9db3dd, bounce: 0.6 },
  grumpy:      { eyes: 'angry',  mouth: 'pout',  brows: -0.6, blush: 0.1, tint: 0xd9b8b8, bounce: 0.7 },
  angry:       { eyes: 'angry',  mouth: 'frown', brows: -0.8, blush: 0.2, tint: 0xf0a8a8, bounce: 1.0 },
  scared:      { eyes: 'wide',   mouth: 'wavy',  brows: 0.6,  blush: 0.0, tint: 0xcfd9f5, bounce: 1.3 },
  anxious:     { eyes: 'spiral', mouth: 'wavy',  brows: 0.3,  blush: 0.2, tint: 0xd9d0c4, bounce: 1.1 },
});

// effect: particle/motion overlay drawn by the renderer
export const VARIANTS = Object.freeze({
  base:    { effect: 'none',     pose: 'idle' },
  sparkle: { effect: 'sparkle',  pose: 'idle' },
  bounce:  { effect: 'none',     pose: 'bounce' },
  wiggle:  { effect: 'none',     pose: 'wiggle' },
  glow:    { effect: 'glow',     pose: 'idle' },
  hearts:  { effect: 'hearts',   pose: 'sway' },
  notes:   { effect: 'notes',    pose: 'sway' },
  burst:   { effect: 'burst',    pose: 'bounce' },
  drift:   { effect: 'bubbles',  pose: 'float' },
  spin:    { effect: 'sparkle',  pose: 'spin' },
});

const build = () => {
  const emotes = {};
  for (const [aName, arch] of Object.entries(ARCHETYPES)) {
    for (const [vName, variant] of Object.entries(VARIANTS)) {
      const name = vName === 'base' ? aName : `${aName}-${vName}`;
      emotes[name] = Object.freeze({ name, archetype: aName, variant: vName, ...arch, ...variant });
    }
  }
  return Object.freeze(emotes);
};

export const EMOTES = build();
export const EMOTE_NAMES = Object.freeze(Object.keys(EMOTES));
export const EMOTE_COUNT = EMOTE_NAMES.length; // 250

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Choose a random variant of an archetype family.
export function emoteFor(archetype, variant) {
  const family = EMOTE_NAMES.filter((n) => EMOTES[n].archetype === archetype);
  if (family.length === 0) return EMOTES.content;
  if (variant) return EMOTES[variant === 'base' ? archetype : `${archetype}-${variant}`] ?? EMOTES[pick(family)];
  return EMOTES[pick(family)];
}

// Map words in the pet's speech to an emote family (drives reactions while talking).
const KEYWORD_MOODS = [
  [/love|ador|cuddl|sweet/i, 'loving'],
  [/yay|amazing|wonderful|best/i, 'ecstatic'],
  [/play|game|fun|tickle/i, 'playful'],
  [/hungry|food|snack|eat/i, 'hungry'],
  [/sleep|tired|nap|yawn/i, 'sleepy'],
  [/sad|miss|lonely/i, 'sad'],
  [/wow|really|what/i, 'surprised'],
  [/hmm|wonder|why/i, 'curious'],
  [/hehe|trick|secret/i, 'mischievous'],
  [/scared|spooky|afraid/i, 'scared'],
];

export function emoteFromText(text) {
  for (const [re, mood] of KEYWORD_MOODS) {
    if (re.test(text)) return emoteFor(mood);
  }
  return null;
}
