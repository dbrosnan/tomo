import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, getOrCreatePet, savePet, logInteraction, addMemory, recentMemories, logSentiment, recentSentiments } from './db.js';
import { parseSentiment, applySentiment, sentimentTool, sentimentContext } from './sentiment.js';
import { singingInstructions, singingInput, singingOptions, TTS_MODEL } from './singing.js';
import { applyDecay, applyInteraction, INTERACTION_KINDS, personaInstructions, dominantMood, relationshipStage } from './petLogic.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '64kb' }));
const PUBLIC_DIR = path.join(__dirname, '../web/public');
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

// Hashed bundles under /assets are immutable; everything else (index.html, css) must revalidate
// on every load so a new deploy is picked up immediately instead of after the edge's browser TTL.
const cacheHeaders = (res, filePath) => {
  const immutable = filePath.includes(`${path.sep}assets${path.sep}`);
  res.setHeader('Cache-Control', immutable ? `public, max-age=${ONE_YEAR_SECONDS}, immutable` : 'no-cache');
};
app.use(express.static(PUBLIC_DIR, { setHeaders: cacheHeaders }));

const asJson = (pet) => ({
  ...pet,
  stage: relationshipStage(pet.bond),
  dominantMood: dominantMood(pet),
});

app.get('/healthz', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'database unreachable' });
  }
});

app.get('/api/pet', async (_req, res) => {
  try {
    const decayed = applyDecay(await getOrCreatePet());
    const pet = await savePet(decayed);
    const [memories, sentiments] = await Promise.all([recentMemories(pet.id), recentSentiments(pet.id)]);
    res.json({ pet: asJson(pet), memories, sentiments });
  } catch (err) {
    console.error('[pet:get]', err);
    res.status(500).json({ error: 'could not load your pet — please retry' });
  }
});

app.post('/api/pet/interact', async (req, res) => {
  try {
    const { kind, detail } = req.body ?? {};
    if (!INTERACTION_KINDS.includes(kind)) {
      return res.status(400).json({ error: `kind must be one of: ${INTERACTION_KINDS.join(', ')}` });
    }
    const current = applyDecay(await getOrCreatePet());
    const { pet: next, bondDelta } = applyInteraction(current, kind);
    const pet = await savePet(next);
    await logInteraction(pet.id, kind, detail, bondDelta);
    res.json({ pet: asJson(pet) });
  } catch (err) {
    console.error('[pet:interact]', err);
    res.status(500).json({ error: 'interaction failed — please retry' });
  }
});

app.post('/api/pet/memory', async (req, res) => {
  try {
    const content = typeof req.body?.content === 'string' ? req.body.content.slice(0, 500) : '';
    if (!content) return res.status(400).json({ error: 'content required' });
    const pet = await getOrCreatePet();
    await addMemory(pet.id, content);
    res.json({ ok: true });
  } catch (err) {
    console.error('[pet:memory]', err);
    res.status(500).json({ error: 'could not save memory' });
  }
});

// Record how the person sounded (reported by Tomo's realtime session via the report_sentiment tool).
app.post('/api/sentiment', async (req, res) => {
  let reading;
  try {
    reading = parseSentiment(JSON.stringify(req.body ?? {}));
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  try {
    const current = applyDecay(await getOrCreatePet());
    const { pet: next, effects } = applySentiment(current, reading);
    const pet = await savePet(next);
    await logSentiment(pet.id, reading);
    res.json({ pet: asJson(pet), sentiment: reading, effects });
  } catch (err) {
    console.error('[sentiment]', err);
    res.status(500).json({ error: 'could not record how you sound — please retry' });
  }
});

// Mint a short-lived Higgs Realtime client secret so the browser never sees the API key.
app.post('/api/realtime/secret', async (_req, res) => {
  const apiKey = process.env.BOSON_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'voice offline: BOSON_API_KEY is not configured yet' });
  }
  try {
    const pet = applyDecay(await getOrCreatePet());
    const upstream = await fetch('https://api.boson.ai/v1/realtime/client_secrets', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!upstream.ok) {
      const text = await upstream.text();
      console.error('[realtime:secret] upstream', upstream.status, text.slice(0, 300));
      return res.status(502).json({ error: 'voice service rejected the request' });
    }
    const data = await upstream.json();
    const secret = data?.client_secret?.value ?? data?.value ?? data?.secret ?? null;
    if (!secret) {
      console.error('[realtime:secret] unexpected shape', JSON.stringify(data).slice(0, 300));
      return res.status(502).json({ error: 'voice service returned an unexpected response' });
    }
    const note = sentimentContext(await recentSentiments(pet.id));
    res.json({
      secret,
      instructions: personaInstructions(pet, note),
      singingInstructions: singingInstructions(pet),
      tools: [sentimentTool],
    });
  } catch (err) {
    console.error('[realtime:secret]', err);
    res.status(500).json({ error: 'could not start voice session' });
  }
});

// Render a lyric line as singing with Higgs TTS and stream the WAV back to the browser.
app.post('/api/sing', async (req, res) => {
  const apiKey = process.env.BOSON_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'singing offline: BOSON_API_KEY is not configured yet' });
  let input, options;
  try {
    options = singingOptions(req.body);
    input = `${options.prefix}${singingInput(req.body?.text)}`;
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  try {
    const upstream = await fetch('https://api.boson.ai/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: TTS_MODEL, input, voice: options.voice, response_format: 'wav', enable_tn: options.normalize }),
    });
    if (!upstream.ok) {
      const text = await upstream.text();
      console.error('[sing] upstream', upstream.status, text.slice(0, 300));
      return res.status(502).json({ error: `singing voice unavailable (${upstream.status})` });
    }
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Cache-Control', 'no-store');
    res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (err) {
    console.error('[sing]', err);
    res.status(500).json({ error: 'could not sing that line' });
  }
});

const port = Number(process.env.PORT) || 8080;
app.listen(port, () => console.log(`tomo listening on :${port}`));
