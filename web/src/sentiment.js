// How Tomo reacts, visibly, to how the person sounds.
import { emoteFor } from './emotes.js';

// Empathy, not mirroring: hard feelings get comfort, good ones get amplified.
const REACTIONS = Object.freeze({
  joyful:       ['ecstatic', 'sparkle'],
  excited:      ['ecstatic', 'burst'],
  affectionate: ['adoring', 'hearts'],
  content:      ['content', 'glow'],
  neutral:      ['curious', 'base'],
  tired:        ['dreamy', 'drift'],
  anxious:      ['loving', 'glow'],
  sad:          ['loving', 'hearts'],
  angry:        ['shy', 'wiggle'],
});

const LABELS = Object.freeze({
  joyful: '😊 joyful', excited: '🤩 excited', affectionate: '🥰 affectionate', content: '🙂 content',
  neutral: '😐 neutral', tired: '😴 tired', anxious: '😟 anxious', sad: '😢 sad', angry: '😠 angry',
});

export function emoteForSentiment(sentiment) {
  const [archetype, variant] = REACTIONS[sentiment] ?? ['content', 'base'];
  return emoteFor(archetype, variant);
}

export function sentimentLabel(sentiment) {
  return LABELS[sentiment] ?? sentiment;
}
