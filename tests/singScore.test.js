import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreWav, pickBestRendering, DRONE_SECONDS, MIN_SUSTAIN } from '../server/singScore.js';

const RATE = 24000;
const wavFrom = (samples) => {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), i * 2));
  const wav = Buffer.alloc(44 + data.length);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + data.length, 4); wav.write('WAVE', 8); wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(RATE, 24);
  wav.writeUInt32LE(RATE * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36);
  wav.writeUInt32LE(data.length, 40); data.copy(wav, 44);
  return wav;
};
const tone = (hz, seconds) => Array.from({ length: RATE * seconds }, (_, i) => 0.6 * Math.sin(2 * Math.PI * hz * i / RATE));
const glide = (from, to, seconds) => { let phase = 0; return Array.from({ length: RATE * seconds }, (_, i) => { const hz = from + (to - from) * i / (RATE * seconds); phase += 2 * Math.PI * hz / RATE; return 0.6 * Math.sin(phase); }); };

test('a melody of held notes scores as sustained singing', () => {
  const notes = [...tone(220, 0.5), ...tone(262, 0.5), ...tone(330, 0.5), ...tone(262, 0.5)];
  const s = scoreWav(wavFrom(notes));
  assert.ok(s.sustain > 0.85, `sustain ${s.sustain}`);
  assert.ok(s.longestNote >= 0.4 && s.longestNote < 0.7, `longestNote ${s.longestNote}`);
  assert.ok(Math.abs(s.duration - 2) < 0.1);
});

test('a continuous pitch glide (speech-like) scores as unsustained', () => {
  const s = scoreWav(wavFrom(glide(120, 400, 2)));
  assert.ok(s.sustain < 0.3, `sustain ${s.sustain}`);
});

test('silence is unvoiced and a single held tone is a drone', () => {
  assert.equal(scoreWav(wavFrom(new Array(RATE).fill(0))).voiced, 0);
  const s = scoreWav(wavFrom(tone(200, DRONE_SECONDS + 1)));
  assert.ok(s.longestNote > DRONE_SECONDS);
  assert.equal(s.drone, true);
});

test('pickBestRendering prefers the most sustained non-drone candidate', () => {
  const sung = { score: { sustain: 0.8, drone: false }, wav: 'a' };
  const spoken = { score: { sustain: 0.3, drone: false }, wav: 'b' };
  const drone = { score: { sustain: 0.99, drone: true }, wav: 'c' };
  assert.equal(pickBestRendering([spoken, sung, drone]).wav, 'a');
  assert.equal(pickBestRendering([spoken, drone]).wav, 'b', 'spoken beats a drone');
  assert.equal(pickBestRendering([drone]).wav, 'c', 'a lone drone is still returned rather than nothing');
  assert.ok(MIN_SUSTAIN > 0 && MIN_SUSTAIN < 1);
});
