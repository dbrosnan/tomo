import { PetRenderer } from './pet.js';
import { EMOTES, EMOTE_COUNT, emoteFor, emoteFromText } from './emotes.js';
import { HiggsVoice } from './voice.js';
import { emoteForSentiment, sentimentLabel } from './sentiment.js';

const $ = (id) => document.getElementById(id);

const state = {
  pet: null,
  voice: null,
  talking: false,
  sentiments: [],
  holdUntil: 0,       // reaction emotes pause the ambient loop until this time
  nextAmbientAt: 0,
  lastChatterAt: 0,
};

const setStatus = (text) => { $('status').textContent = text; };

// Bottom bar: the latest reading in full (label, intensity, why) plus a trail of earlier ones,
// so it is obvious whether Tomo is hearing the person correctly.
const renderSentiments = (readings = []) => {
  const latest = readings[0];
  if (!latest) return;
  $('sentiment').textContent = `${sentimentLabel(latest.sentiment)} · ${latest.intensity}/5`;
  $('sentimentReason').textContent = latest.reason ? `“${latest.reason}”` : '';
  $('sentimentTrail').textContent = readings.slice(1, 8).map((r) => sentimentLabel(r.sentiment).split(' ')[0]).join(' ');
  $('sentimentBar').classList.add('live');
};

const renderStats = (pet) => {
  $('petName').textContent = pet.name;
  $('stage').textContent = pet.stage.replace('-', ' ');
  $('bond').textContent = pet.bond;
  const bars = { mood: pet.mood, energy: pet.energy, fun: pet.fun, food: 100 - pet.hunger };
  for (const [key, val] of Object.entries(bars)) {
    $(`bar-${key}`).style.width = `${val}%`;
    $(`bar-${key}`).classList.toggle('low', val < 25);
  }
};

const applyEmote = (renderer, emote) => {
  renderer.setEmote(emote);
  $('emoteName').textContent = emote.name;
};

// Reaction: takes priority over the ambient loop for `hold` ms.
const showEmote = (renderer, emote, hold = 3500) => {
  applyEmote(renderer, emote);
  state.holdUntil = Date.now() + hold;
};

// --- ambient emote life -------------------------------------------------
// Tomo drifts through variants of his current mood, with occasional flavor
// detours, so he never sits frozen on one face.
const FLAVOR_NEIGHBORS = {
  joyful: ['playful', 'content', 'curious', 'ecstatic'],
  ecstatic: ['joyful', 'amazed', 'playful'],
  content: ['curious', 'dreamy', 'joyful', 'shy'],
  loving: ['adoring', 'dreamy', 'shy', 'content'],
  sleepy: ['dozing', 'dreamy', 'bored'],
  starving: ['hungry', 'grumpy', 'sad'],
  sad: ['teary', 'bored', 'dreamy'],
  bored: ['sleepy', 'curious', 'grumpy'],
};

const ambientTick = (renderer) => {
  const now = Date.now();
  if (!state.pet || now < state.holdUntil || now < state.nextAmbientAt) return;
  const base = state.pet.dominantMood;
  const detour = Math.random() < 0.3;
  const family = detour
    ? (FLAVOR_NEIGHBORS[base] ?? ['curious', 'playful'])[Math.floor(Math.random() * (FLAVOR_NEIGHBORS[base]?.length ?? 2))]
    : base;
  applyEmote(renderer, emoteFor(family));
  state.nextAmbientAt = now + 5000 + Math.random() * 4000; // 5-9s per emote
};

// --- idle voice chatter -------------------------------------------------
const CHATTER_PROMPTS = [
  (p) => `No one has spoken for a bit. Say something short and spontaneous as ${p.name} — a stray thought, a little observation about living on a screen, or a question for your person.`,
  (p) => p.hunger > 60 ? 'You are getting hungry. Mention it cutely and ask for a snack.' : null,
  (p) => p.energy < 30 ? 'You are sleepy. Yawn mid-sentence and hint that a nap sounds nice.' : null,
  (p) => p.fun < 30 ? 'You are bored. Playfully beg for a game.' : null,
  () => 'Hum or sing a tiny made-up tune about your day, just a few seconds long.',
  (p) => `Ask your person one curious question about their day. Relationship stage: ${p.stage}.`,
];

const chatterTick = () => {
  if (!state.talking || !state.voice?.active || !state.pet) return;
  // Speak up only after ~20s of mutual silence, at most every 30s.
  if (state.voice.idleMs() < 20_000 || Date.now() - state.lastChatterAt < 30_000) return;
  const candidates = CHATTER_PROMPTS.map((f) => f(state.pet)).filter(Boolean);
  const prompt = candidates[Math.floor(Math.random() * candidates.length)];
  state.voice.speak(prompt);
  state.lastChatterAt = Date.now();
};

async function loadPet(renderer) {
  const res = await fetch('/api/pet');
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  state.pet = data.pet;
  renderStats(data.pet);
  renderSentiments(data.sentiments);
  ambientTick(renderer);
}

const REACTION_SPEECH = {
  feed: 'They just fed you! React out loud with delight, a happy eating sound, and thank them.',
  play: 'They just played with you! Giggle and say how fun that was.',
  cuddle: 'They just cuddled you! Melt a little and say something affectionate.',
  sleep: 'They tucked you in for a nap. Yawn and say a drowsy goodnight.',
};

async function interact(renderer, kind) {
  try {
    const res = await fetch('/api/pet/interact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    state.pet = data.pet;
    renderStats(data.pet);
    const reaction = {
      feed: emoteFor('joyful', 'burst'),
      play: emoteFor('playful'),
      cuddle: emoteFor('adoring', 'hearts'),
      sleep: emoteFor('dozing', 'drift'),
    }[kind] ?? emoteFor(data.pet.dominantMood);
    showEmote(renderer, reaction, 4500);
    if (state.talking && REACTION_SPEECH[kind]) state.voice?.speak(REACTION_SPEECH[kind]);
  } catch (err) {
    setStatus(err.message);
  }
}

async function toggleVoice(renderer) {
  if (state.talking) {
    state.voice?.stop();
    state.voice = null;
    state.talking = false;
    $('micBtn').classList.remove('on');
    return;
  }
  try {
    state.voice = new HiggsVoice({
      onStatus: setStatus,
      onSpeakingChange: (speaking) => {
        if (speaking) {
          showEmote(renderer, emoteFor(state.pet?.dominantMood ?? 'content', 'bounce'), 600_000);
        } else {
          state.holdUntil = 0; // resume ambient life
        }
      },
      onSentiment: ({ pet, sentiment }) => {
        state.pet = pet;
        renderStats(pet);
        renderSentiments([sentiment, ...(state.sentiments ?? [])]);
        state.sentiments = [sentiment, ...(state.sentiments ?? [])].slice(0, 8);
        showEmote(renderer, emoteForSentiment(sentiment.sentiment), 5000);
      },
      onTranscript: (text, fromPet) => {
        if (!fromPet) return;
        const emote = emoteFromText(text);
        if (emote) applyEmote(renderer, emote);
      },
    });
    await state.voice.start();
    state.talking = true;
    state.lastChatterAt = Date.now();
    $('micBtn').classList.add('on');
    state.voice.speak('You just noticed your person arrived. Greet them warmly in character and ask how they are.');
    fetch('/api/pet/interact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'talk', detail: 'voice chat' }),
    }).catch(() => {});
  } catch (err) {
    setStatus(err.message);
    state.voice = null;
  }
}

function buildGallery(renderer) {
  const grid = $('galleryGrid');
  $('emoteCount').textContent = EMOTE_COUNT;
  for (const emote of Object.values(EMOTES)) {
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.textContent = emote.name;
    chip.addEventListener('click', () => showEmote(renderer, emote, 6000));
    grid.appendChild(chip);
  }
  $('galleryBtn').addEventListener('click', () => $('gallery').classList.toggle('open'));
}

async function boot() {
  const renderer = await new PetRenderer().mount($('stage-host'));
  buildGallery(renderer);
  $('feedBtn').addEventListener('click', () => interact(renderer, 'feed'));
  $('playBtn').addEventListener('click', () => interact(renderer, 'play'));
  $('cuddleBtn').addEventListener('click', () => interact(renderer, 'cuddle'));
  $('sleepBtn').addEventListener('click', () => interact(renderer, 'sleep'));
  $('micBtn').addEventListener('click', () => toggleVoice(renderer));
  try {
    await loadPet(renderer);
    setStatus('your friend is here ✨');
  } catch (err) {
    setStatus(err.message ?? 'could not reach the server');
    applyEmote(renderer, emoteFor('content'));
  }
  setInterval(() => ambientTick(renderer), 1000);
  setInterval(chatterTick, 5000);
  setInterval(() => loadPet(renderer).catch(() => {}), 90_000);
}

boot();
