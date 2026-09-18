import pg from 'pg';

// Keep idle timeout under InstaCloud's scale-to-zero suspend window.
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 8_000,
});

pool.on('error', (err) => {
  console.error('[db] idle client error', err.message);
});

export async function getOrCreatePet() {
  const existing = await pool.query('SELECT * FROM pets ORDER BY id LIMIT 1');
  if (existing.rows.length > 0) return existing.rows[0];
  const created = await pool.query('INSERT INTO pets DEFAULT VALUES RETURNING *');
  return created.rows[0];
}

export async function savePet(pet) {
  const { rows } = await pool.query(
    `UPDATE pets SET bond=$2, trust=$3, mood=$4, hunger=$5, energy=$6, fun=$7, last_seen=$8
     WHERE id=$1 RETURNING *`,
    [pet.id, pet.bond, pet.trust, pet.mood, pet.hunger, pet.energy, pet.fun, pet.last_seen],
  );
  return rows[0];
}

export async function logInteraction(petId, kind, detail, bondDelta) {
  await pool.query(
    'INSERT INTO interactions (pet_id, kind, detail, bond_delta) VALUES ($1,$2,$3,$4)',
    [petId, kind, detail ?? null, bondDelta],
  );
}

export async function addMemory(petId, content) {
  await pool.query('INSERT INTO memories (pet_id, content) VALUES ($1,$2)', [petId, content]);
}

export async function recentMemories(petId, limit = 5) {
  const { rows } = await pool.query(
    'SELECT content, created_at FROM memories WHERE pet_id=$1 ORDER BY created_at DESC LIMIT $2',
    [petId, limit],
  );
  return rows;
}

export async function logSentiment(petId, { sentiment, intensity, reason }) {
  await pool.query(
    'INSERT INTO sentiments (pet_id, sentiment, intensity, reason) VALUES ($1,$2,$3,$4)',
    [petId, sentiment, intensity, reason ?? null],
  );
}

export async function recentSentiments(petId, limit = 8) {
  const { rows } = await pool.query(
    'SELECT sentiment, intensity, reason, created_at FROM sentiments WHERE pet_id=$1 ORDER BY created_at DESC LIMIT $2',
    [petId, limit],
  );
  return rows;
}
