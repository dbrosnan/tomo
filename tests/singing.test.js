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
  assert.match(text, /open vowels/i, 'lyrics must be written to be singable');
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

test('singingOptions accepts documented voices and tags only', async () => {
  const { singingOptions } = await import('../server/singing.js');
  assert.deepEqual(singingOptions({}), { voice: 'nora', prefix: '', normalize: true });
  assert.deepEqual(singingOptions({ voice: 'nora', tags: ['emotion:elation', 'prosody:pitch_high'], normalize: false }),
    { voice: 'nora', prefix: '<|emotion:elation|><|prosody:pitch_high|>', normalize: false });
  assert.throws(() => singingOptions({ voice: 'elvis' }), /voice/);
  assert.throws(() => singingOptions({ tags: ['style:evil'] }), /tag/);
});

test('the default singing voice is a preset that actually sings, not "default"', async () => {
  const { singingOptions, SINGING_VOICE } = await import('../server/singing.js');
  assert.equal(SINGING_VOICE, 'nora');
  assert.equal(singingOptions({}).voice, 'nora');
});

test('trimWav caps a runaway rendering and rewrites the RIFF sizes', async () => {
  const { trimWav } = await import('../server/singing.js');
  const rate = 24000, seconds = 3, bytes = rate * 2 * seconds;
  const wav = Buffer.alloc(44 + bytes);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + bytes, 4); wav.write('WAVE', 8); wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(bytes, 40);
  const trimmed = trimWav(wav, 1);
  assert.equal(trimmed.length, 44 + rate * 2);
  assert.equal(trimmed.readUInt32LE(40), rate * 2);
  assert.equal(trimmed.readUInt32LE(4), 36 + rate * 2);
  assert.equal(trimWav(wav, 10), wav, 'short renderings pass through untouched');
});
