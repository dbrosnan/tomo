import test from 'node:test';
import assert from 'node:assert/strict';
import { singingInstructions, singingInput, SINGING_TAG, MAX_LYRIC_CHARS } from '../server/singing.js';
import { applyInteraction, INTERACTION_KINDS } from '../server/petLogic.js';

const pet = { name: 'Tomo', bond: 40, trust: 50, mood: 60, hunger: 30, energy: 70, fun: 50 };

test('singingInstructions tells the model to answer with short lyric lines only', () => {
  const text = singingInstructions(pet);
  assert.match(text, /Tomo/);
  assert.match(text, /lyric/i);
  assert.match(text, /two lines|1–2 lines|one or two lines/i);
  assert.doesNotMatch(text, /report_sentiment/);
});

test('singingInput prefixes the Boson singing tag and strips stage directions', () => {
  assert.equal(singingInput('La la la, the moon is high'), `${SINGING_TAG}La la la, the moon is high`);
  assert.equal(singingInput('  (softly) "Sing with me"  '), `${SINGING_TAG}Sing with me`);
  assert.equal(SINGING_TAG, '<|style:singing|>');
});

test('singingInput rejects empty or oversized lyrics', () => {
  assert.throws(() => singingInput('   '), /lyric/);
  assert.throws(() => singingInput('x'.repeat(MAX_LYRIC_CHARS + 1)), /long/);
  assert.throws(() => singingInput(42), /lyric/);
});

test('singing is an interaction that lifts fun and mood', () => {
  assert.ok(INTERACTION_KINDS.includes('sing'));
  const { pet: next, bondDelta } = applyInteraction(pet, 'sing');
  assert.ok(next.fun > pet.fun);
  assert.ok(next.mood > pet.mood);
  assert.ok(bondDelta > 0);
});
