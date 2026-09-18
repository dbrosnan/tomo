import test from 'node:test';
import assert from 'node:assert/strict';
import { emoteForSentiment, sentimentLabel } from '../web/src/sentiment.js';
import { SENTIMENTS } from '../server/sentiment.js';
import { EMOTES } from '../web/src/emotes.js';

test('every sentiment maps to a real emote and a display label', () => {
  for (const s of SENTIMENTS) {
    const emote = emoteForSentiment(s);
    assert.ok(emote && EMOTES[emote.name], `${s} -> ${emote?.name}`);
    assert.match(sentimentLabel(s), /\S/);
  }
});

test('sadness is answered with comfort, not mirrored sadness', () => {
  assert.equal(emoteForSentiment('sad').archetype, 'loving');
  assert.equal(emoteForSentiment('joyful').archetype, 'ecstatic');
  assert.equal(emoteForSentiment('unknown').archetype, 'content');
});
