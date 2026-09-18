import test from 'node:test';
import assert from 'node:assert/strict';
import { EMOTES, EMOTE_COUNT, EMOTE_NAMES, emoteFor, emoteFromText } from '../web/src/emotes.js';

test('exactly 250 unique emotes', () => {
  assert.equal(EMOTE_COUNT, 250);
  assert.equal(new Set(EMOTE_NAMES).size, 250);
});

test('every emote has complete render parameters', () => {
  for (const emote of Object.values(EMOTES)) {
    for (const key of ['eyes', 'mouth', 'brows', 'blush', 'tint', 'effect', 'pose', 'name']) {
      assert.ok(key in emote, `${emote.name} missing ${key}`);
    }
  }
});

test('emoteFor returns members of the requested family', () => {
  for (let i = 0; i < 20; i++) {
    assert.equal(emoteFor('loving').archetype, 'loving');
  }
  assert.equal(emoteFor('loving', 'hearts').name, 'loving-hearts');
  assert.equal(emoteFor('nonexistent').name, 'content');
});

test('speech keywords map to emote families', () => {
  assert.equal(emoteFromText('I love you so much!').archetype, 'loving');
  assert.equal(emoteFromText('I am so hungry, feed me a snack').archetype, 'hungry');
  assert.equal(emoteFromText('nothing matches here'), null);
});
