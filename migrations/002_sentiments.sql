-- How the person sounded on each spoken turn, as judged by Higgs Realtime.
CREATE TABLE IF NOT EXISTS sentiments (
  id         SERIAL PRIMARY KEY,
  pet_id     INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  sentiment  TEXT NOT NULL,
  intensity  SMALLINT NOT NULL CHECK (intensity BETWEEN 1 AND 5),
  reason     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sentiments_pet ON sentiments(pet_id, created_at DESC);
