import test from 'node:test';
import assert from 'node:assert/strict';
import { SENTIMENTS, parseSentiment, applySentiment, sentimentTool, sentimentContext } from '../server/sentiment.js';

const basePet = { bond: 40, trust: 50, mood: 60, hunger: 30, energy: 70, fun: 50 };

test('parseSentiment accepts a valid tool payload and normalises it', () => {
  const out = parseSentiment(JSON.stringify({ sentiment: 'Sad', intensity: 4, reason: 'slow, flat voice' }));
  assert.deepEqual(out, { sentiment: 'sad', intensity: 4, reason: 'slow, flat voice' });
});

test('parseSentiment rejects unknown labels, bad intensity, and junk', () => {
  assert.throws(() => parseSentiment(JSON.stringify({ sentiment: 'confused', intensity: 3 })), /sentiment/);
  assert.throws(() => parseSentiment(JSON.stringify({ sentiment: 'sad', intensity: 9 })), /intensity/);
  assert.throws(() => parseSentiment('not json'), /JSON/);
  assert.throws(() => parseSentiment(JSON.stringify({ sentiment: 'sad', intensity: 2, reason: 'x'.repeat(500) })), /reason/);
});

test('applySentiment: shared joy lifts mood and bond, without mutating input', () => {
  const frozen = Object.freeze({ ...basePet });
  const { pet, effects } = applySentiment(frozen, { sentiment: 'joyful', intensity: 5 });
  assert.ok(pet.mood > basePet.mood);
  assert.ok(pet.bond > basePet.bond);
  assert.equal(effects.kind, 'uplift');
  assert.deepEqual(frozen, basePet);
});

test('applySentiment: sadness is met with empathy — trust up, mood down a little', () => {
  const { pet, effects } = applySentiment(basePet, { sentiment: 'sad', intensity: 3 });
  assert.ok(pet.trust > basePet.trust);
  assert.ok(pet.mood < basePet.mood);
  assert.equal(effects.kind, 'comfort');
});

test('applySentiment: neutral leaves the pet unchanged apart from a tiny bond tick', () => {
  const { pet } = applySentiment(basePet, { sentiment: 'neutral', intensity: 1 });
  assert.equal(pet.mood, basePet.mood);
  assert.equal(pet.bond, basePet.bond + 1);
});

test('the tool schema exposes every sentiment label as an enum', () => {
  assert.equal(sentimentTool.name, 'report_sentiment');
  assert.deepEqual(sentimentTool.parameters.properties.sentiment.enum, SENTIMENTS);
  assert.ok(sentimentTool.parameters.required.includes('sentiment'));
});

test('sentimentContext summarises recent readings for the persona prompt', () => {
  assert.equal(sentimentContext([]), '');
  const text = sentimentContext([{ sentiment: 'sad', intensity: 4 }, { sentiment: 'tired', intensity: 2 }]);
  assert.match(text, /sad/);
  assert.match(text, /tired/);
});
