// Higgs Realtime voice client: mic -> 24kHz PCM16 over WebSocket, spoken replies back.
import { createPlaybackQueue } from './playback.js';

const WS_URL = 'wss://api.boson.ai/v1/realtime?model=higgs-realtime';
const SAMPLE_RATE = 24000;
const MUTE_TAIL_MS = 400; // in-flight chunks of a cancelled reply (only used when no response id)

const b64FromInt16 = (int16) => {
  const bytes = new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
};

const int16FromB64 = (b64) => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Int16Array(bytes.buffer);
};

export class HiggsVoice {
  constructor({ onTranscript, onStatus, onSpeakingChange, onSentiment }) {
    this.onTranscript = onTranscript;
    this.onSentiment = onSentiment ?? (() => {});
    this.onStatus = onStatus;
    this.onSpeakingChange = onSpeakingChange;
    this.playback = null;
    this.currentResponseId = null;
    this.mutedResponseId = null;
    this.mutedUntil = 0;
    this.active = false;
    this.lastActivityAt = Date.now(); // any audio in either direction
    this.speaking = false;
  }

  async start() {
    this.onStatus('requesting voice session…');
    const res = await fetch('/api/realtime/secret', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'voice session unavailable');

    this.ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
    await this.ctx.resume();
    this.playback = createPlaybackQueue(this.ctx, SAMPLE_RATE);
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });

    await new Promise((resolve, reject) => {
      // Offer both subprotocols: "realtime" plus the ephemeral credential.
      this.ws = new WebSocket(WS_URL, ['realtime', `bai-client-secret.${data.secret}`]);
      const failTimer = setTimeout(() => reject(new Error('voice service connection timed out')), 10_000);
      this.ws.onopen = () => { clearTimeout(failTimer); resolve(); };
      // A handshake failure fires error then close; the close event carries the code, so report there.
      this.ws.onerror = () => {};
      this.ws.onclose = (ev) => {
        clearTimeout(failTimer);
        const detail = ev.reason ? `${ev.code}: ${ev.reason}` : String(ev.code);
        reject(new Error(`could not reach the voice service (closed ${detail})`));
      };
    });

    this.ws.onmessage = (ev) => this.handleEvent(ev);
    this.ws.onclose = (ev) => {
      if (this.active) this.stop(`voice session ended (${ev.code})`);
    };
    this.send({
      type: 'session.update',
      session: {
        type: 'realtime',
        model: 'higgs-realtime',
        instructions: data.instructions,
        tools: data.tools ?? [],
        tool_choice: 'auto',
        output_modalities: ['audio'],
        audio: {
          input: {
            format: { type: 'audio/pcm', rate: SAMPLE_RATE },
            turn_detection: { type: 'server_vad', interrupt_response: true },
          },
          output: {
            format: { type: 'audio/pcm', rate: SAMPLE_RATE },
            voice: 'default',
          },
        },
        temperature: 0.6,
      },
    });

    const source = this.ctx.createMediaStreamSource(this.stream);
    this.proc = this.ctx.createScriptProcessor(4096, 1, 1);
    this.proc.onaudioprocess = (e) => {
      if (!this.active || this.ws?.readyState !== WebSocket.OPEN) return;
      const f32 = e.inputBuffer.getChannelData(0);
      const i16 = new Int16Array(f32.length);
      let loud = false;
      for (let i = 0; i < f32.length; i++) {
        const s = Math.max(-1, Math.min(1, f32[i]));
        i16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        if (Math.abs(s) > 0.06) loud = true;
      }
      if (loud) this.lastActivityAt = Date.now();
      this.send({ type: 'input_audio_buffer.append', audio: b64FromInt16(i16) });
    };
    source.connect(this.proc);
    this.proc.connect(this.ctx.destination);

    this.active = true;
    this.onStatus('listening — say hi!');
  }

  send(obj) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }

  // Ask Tomo to speak spontaneously with a one-off directive.
  speak(directive) {
    if (!this.active || this.speaking) return;
    this.lastActivityAt = Date.now();
    this.send({
      type: 'response.create',
      response: { instructions: directive, max_output_tokens: 220 },
    });
  }

  idleMs() {
    return Date.now() - this.lastActivityAt;
  }

  handleEvent(ev) {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    const t = msg.type ?? '';
    if (t === 'input_audio_buffer.speech_started') {
      this.lastActivityAt = Date.now();
      this.interrupt();
    } else if (t === 'response.function_call_arguments.done') {
      this.handleToolCall(msg);
    } else if (t === 'response.created') {
      this.currentResponseId = msg.response?.id ?? null;
    } else if (t === 'response.output_audio.delta' && msg.delta) {
      if (this.isMuted(msg.response_id)) return; // tail of a reply the person already cut off
      this.lastActivityAt = Date.now();
      this.playback.enqueue(int16FromB64(msg.delta));
      this.setSpeaking(true);
    } else if (t.endsWith('output_audio.done') || t === 'response.done') {
      // Audio may still be draining from the play queue; hand off to a timer.
      clearTimeout(this.speakDoneTimer);
      this.speakDoneTimer = setTimeout(() => this.setSpeaking(false), this.playback.remainingMs() + 150);
    } else if (t.includes('transcript') && (msg.delta || msg.transcript)) {
      this.lastActivityAt = Date.now();
      this.onTranscript(msg.delta ?? msg.transcript, t.startsWith('response'));
    } else if (t === 'error') {
      if (msg.error?.code === 'response_not_active') return; // cancel raced a finished reply: harmless
      console.error('[voice]', msg);
      this.onStatus(msg.error?.message ?? 'voice error');
    }
  }

  // Tomo reported how the person sounds. Persist it, then hand the result back so he can reply.
  async handleToolCall(msg) {
    if (msg.name !== 'report_sentiment') return;
    let output = { ok: false };
    try {
      const res = await fetch('/api/sentiment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: msg.arguments,
      });
      const data = await res.json();
      if (res.ok) {
        output = { ok: true, noted: data.sentiment.sentiment };
        this.onSentiment(data);
      } else {
        console.warn('[voice] sentiment rejected:', data.error);
      }
    } catch (err) {
      console.warn('[voice] sentiment failed:', err.message);
    }
    this.send({
      type: 'conversation.item.create',
      item: { type: 'function_call_output', call_id: msg.call_id, output: JSON.stringify(output) },
    });
    this.send({ type: 'response.create' });
  }

  // Drop audio that belongs to a cut-off reply: matched by id when present, else by a short window.
  isMuted(responseId) {
    if (responseId) return responseId === this.mutedResponseId;
    return Date.now() < this.mutedUntil;
  }

  setSpeaking(speaking) {
    if (this.speaking === speaking) return;
    this.speaking = speaking;
    this.onSpeakingChange(speaking);
  }

  // Barge-in: the person started talking, so Tomo goes quiet immediately.
  // Boson streams a whole reply faster than real time, so most of it is queued locally —
  // flushing the queue is what actually silences him; the cancel covers anything still generating.
  interrupt() {
    if (!this.speaking) return;
    this.mutedResponseId = this.currentResponseId;
    this.mutedUntil = Date.now() + MUTE_TAIL_MS;
    this.playback.flush();
    clearTimeout(this.speakDoneTimer);
    this.send({ type: 'response.cancel' });
    this.setSpeaking(false);
  }

  stop(reason = 'voice off') {
    this.active = false;
    clearTimeout(this.speakDoneTimer);
    this.playback?.flush();
    this.proc?.disconnect();
    this.stream?.getTracks().forEach((tr) => tr.stop());
    try { this.ws?.close(); } catch { /* already closed */ }
    this.ctx?.close().catch(() => {});
    this.setSpeaking(false);
    this.onStatus(reason);
  }
}
