import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlaybackQueue } from '../web/src/playback.js';

// Minimal stand-in for the Web Audio API surface the queue touches.
const fakeContext = () => {
  const sources = [];
  const ctx = {
    currentTime: 10,
    destination: {},
    createBuffer: (_ch, length, rate) => ({ duration: length / rate, data: null, getChannelData: () => ({ set: () => {} }) }),
    createBufferSource: () => {
      const src = { buffer: null, started: null, stopped: false, connect: () => {}, start: (at) => { src.started = at; }, stop: () => { src.stopped = true; } };
      sources.push(src);
      return src;
    },
  };
  return { ctx, sources };
};

test('chunks are scheduled back to back without gaps', () => {
  const { ctx, sources } = fakeContext();
  const q = createPlaybackQueue(ctx, 24000);
  q.enqueue(new Int16Array(24000)); // 1s
  q.enqueue(new Int16Array(12000)); // 0.5s
  assert.equal(sources.length, 2);
  assert.ok(sources[0].started >= ctx.currentTime);
  assert.equal(sources[1].started, sources[0].started + 1);
  assert.ok(Math.abs(q.remainingMs() - 1550) < 100);
});

test('flush stops every scheduled chunk and resets the timeline', () => {
  const { ctx, sources } = fakeContext();
  const q = createPlaybackQueue(ctx, 24000);
  q.enqueue(new Int16Array(24000));
  q.enqueue(new Int16Array(24000));
  q.flush();
  assert.ok(sources.every((s) => s.stopped));
  assert.equal(q.remainingMs(), 0);
  q.enqueue(new Int16Array(2400));
  assert.equal(sources.length, 3);
  assert.ok(sources[2].started >= ctx.currentTime, 'restarts from now, not from the old tail');
});

test('finished chunks are forgotten so flush does not stop stale sources', () => {
  const { ctx, sources } = fakeContext();
  const q = createPlaybackQueue(ctx, 24000);
  q.enqueue(new Int16Array(2400));
  sources[0].onended();
  q.flush();
  assert.equal(sources[0].stopped, false);
});

test('enqueueBuffer schedules a decoded AudioBuffer after queued PCM, and flush clears it', () => {
  const { ctx, sources } = fakeContext();
  const q = createPlaybackQueue(ctx, 24000);
  q.enqueue(new Int16Array(24000)); // 1s of PCM
  q.enqueueBuffer({ duration: 2.5 });
  assert.equal(sources.length, 2);
  assert.equal(sources[1].started, sources[0].started + 1);
  assert.ok(Math.abs(q.remainingMs() - 3550) < 100);
  q.flush();
  assert.ok(sources[1].stopped);
  assert.equal(q.remainingMs(), 0);
});
