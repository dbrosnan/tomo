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
  constructor({ onTranscript, onStatus, onSpeakingChange, onSentiment, onLyric }) {
    this.onTranscript = onTranscript;
    this.onSentiment = onSentiment ?? (() => {});
    this.onLyric = onLyric ?? (() => {});
    this.mode = 'talk'; // 'talk' (spoken replies) | 'sing' (lyric text, sung via TTS)
    this.personas = { talk: '', sing: '' };
    this.tools = [];
    this.onStatus = onStatus;
    this.onSpeakingChange = onSpeakingChange;
    this.playback = null;
    this.currentResponseId = null;
    this.mutedResponseId = null;
    this.mutedUntil = 0;
    this.personSpoke = false; // set by server VAD; a sentiment report only counts after real speech
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
    this.personas = { talk: data.instructions, sing: data.singingInstructions ?? data.instructions };
    this.tools = data.tools ?? [];
    this.send({ type: 'session.update', session: this.sessionConfig('talk') });

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

  // Full session shape for a mode. Singing mode returns lyric text (sung by TTS) and drops tools.
  sessionConfig(mode) {
    const singing = mode === 'sing';
    return {
      type: 'realtime',
      model: 'higgs-realtime',
      instructions: this.personas[mode],
      tools: singing ? [] : this.tools,
      tool_choice: singing ? 'none' : 'auto',
      output_modalities: singing ? ['text'] : ['audio'],
      audio: {
        input: {
          format: { type: 'audio/pcm', rate: SAMPLE_RATE },
          // Boson rejects interrupt_response=false; in a duet the client simply keeps its local queue.
          turn_detection: { type: 'server_vad', interrupt_response: true },
        },
        output: { format: { type: 'audio/pcm', rate: SAMPLE_RATE }, voice: 'default' },
      },
      temperature: singing ? 0.8 : 0.6,
    };
  }

  setMode(mode) {
    if (!['talk', 'sing'].includes(mode) || mode === this.mode) return;
    this.mode = mode;
    this.interrupt();
    this.send({ type: 'session.update', session: this.sessionConfig(mode) });
  }

  // Ask Tomo to speak (or sing) spontaneously with a one-off directive.
  // Response-level instructions REPLACE the session persona on Boson, so always resend it.
  speak(directive) {
    if (!this.active || this.speaking) return;
    this.lastActivityAt = Date.now();
    const noTool = this.mode === 'talk' ? ' (The person has not spoken just now, so do not call report_sentiment.)' : '';
    this.send({
      type: 'response.create',
      response: { instructions: `${this.personas[this.mode]}\n\nRight now: ${directive}${noTool}`, max_output_tokens: 220 },
    });
  }

  // Singing mode: render a lyric line with Higgs TTS (singing style) and queue it for playback.
  async sing(text) {
    if (!this.active || this.mode !== 'sing') return;
    try {
      const res = await fetch('/api/sing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        this.onStatus(data.error ?? 'could not sing that line');
        return;
      }
      const buffer = await this.ctx.decodeAudioData(await res.arrayBuffer());
      if (!this.active || this.mode !== 'sing') return; // mode changed while rendering
      this.playback.enqueueBuffer(buffer);
      this.lastActivityAt = Date.now();
      this.setSpeaking(true);
      clearTimeout(this.speakDoneTimer);
      this.speakDoneTimer = setTimeout(() => this.setSpeaking(false), this.playback.remainingMs() + 150);
    } catch (err) {
      console.warn('[voice] sing failed:', err.message);
      this.onStatus('could not sing that line');
    }
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
      this.personSpoke = true;
      if (this.mode === 'talk') this.interrupt(); // in a duet, singing along is welcome
    } else if (t === 'response.output_text.done' && this.mode === 'sing') {
      const lyric = (msg.text ?? '').trim();
      if (lyric) {
        this.onLyric(lyric);
        this.sing(lyric);
      }
    } else if (t === 'response.function_call_arguments.done') {
      this.handleToolCall(msg);
    } else if (t === 'response.created') {
      this.currentResponseId = msg.response?.id ?? null;
    } else if (t === 'response.output_audio.delta' && msg.delta) {
      if (this.isMuted(msg.response_id)) return; // tail of a reply the person already cut off
      this.lastActivityAt = Date.now();
      this.playback.enqueue(int16FromB64(msg.delta));
      this.setSpeaking(true);
    } else if ((t.endsWith('output_audio.done') || t === 'response.done') && this.mode === 'talk') {
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
    if (!this.personSpoke) {
      // Tomo guessed a mood off his own prompt (greeting, ambient chatter). Not a real reading.
      output = { ok: false, skipped: 'the person has not spoken yet' };
    } else try {
      const res = await fetch('/api/sentiment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: msg.arguments,
      });
      const data = await res.json();
      if (res.ok) {
        output = { ok: true, noted: data.sentiment.sentiment };
        this.personSpoke = false; // one reading per spoken turn
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
