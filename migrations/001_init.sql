-- Tomo: relationship-based virtual pet
CREATE TABLE IF NOT EXISTS pets (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL DEFAULT 'Tomo',
  bond       INTEGER NOT NULL DEFAULT 0,      -- lifetime relationship points
  trust      INTEGER NOT NULL DEFAULT 20,     -- 0..100
  mood       INTEGER NOT NULL DEFAULT 70,     -- 0..100
  hunger     INTEGER NOT NULL DEFAULT 30,     -- 0..100 (higher = hungrier)
  energy     INTEGER NOT NULL DEFAULT 80,     -- 0..100
  fun        INTEGER NOT NULL DEFAULT 60,     -- 0..100
  last_seen  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS interactions (
  id         SERIAL PRIMARY KEY,
  pet_id     INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,                   -- feed | play | cuddle | sleep | talk
  detail     TEXT,
  bond_delta INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memories (
  id         SERIAL PRIMARY KEY,
  pet_id     INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_interactions_pet ON interactions(pet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memories_pet ON memories(pet_id, created_at DESC);
