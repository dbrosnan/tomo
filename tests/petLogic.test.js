import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDecay, applyInteraction, relationshipStage, dominantMood, personaInstructions } from '../server/petLogic.js';

const basePet = () => ({
  id: 1, name: 'Tomo', bond: 0, trust: 20, mood: 70, hunger: 30, energy: 80, fun: 60,
  last_seen: new Date().toISOString(),
});

test('applyDecay raises hunger and lowers energy over time, without mutating input', () => {
  const pet = { ...basePet(), last_seen: new Date(Date.now() - 10 * 3.6e6).toISOString() };
  const frozen = JSON.stringify(pet);
  const next = applyDecay(pet);
  assert.equal(JSON.stringify(pet), frozen);
  assert.ok(next.hunger > pet.hunger);
  assert.ok(next.energy < pet.energy);
  assert.ok(next.hunger <= 100 && next.energy >= 0);
});

test('long absence plateaus instead of zeroing everything', () => {
  const pet = { ...basePet(), last_seen: new Date(Date.now() - 400 * 3.6e6).toISOString() };
  const next = applyDecay(pet);
  assert.ok(next.mood >= 0 && next.hunger <= 100);
});

test('feeding reduces hunger and grows bond', () => {
  const { pet: next, bondDelta } = applyInteraction(basePet(), 'feed');
  assert.ok(next.hunger < basePet().hunger);
  assert.equal(next.bond, bondDelta);
});

test('unknown interaction throws', () => {
  assert.throws(() => applyInteraction(basePet(), 'yeet'));
});

test('relationship stages progress with bond', () => {
  assert.equal(relationshipStage(0), 'stranger');
  assert.equal(relationshipStage(120), 'friend');
  assert.equal(relationshipStage(600), 'soulmate');
});

test('dominantMood prioritizes urgent needs', () => {
  assert.equal(dominantMood({ ...basePet(), hunger: 90 }), 'starving');
  assert.equal(dominantMood({ ...basePet(), energy: 5 }), 'sleepy');
  assert.equal(dominantMood({ ...basePet(), mood: 90, trust: 80 }), 'loving');
});

test('persona instructions reflect state', () => {
  const text = personaInstructions({ ...basePet(), bond: 600 });
  assert.match(text, /soulmate/);
  assert.match(text, /Tomo/);
});
