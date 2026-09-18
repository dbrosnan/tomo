// Applies every migrations/*.sql in order. Idempotent (files use IF NOT EXISTS).
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const dir = path.resolve('migrations');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set — run via `insta --agent run -- npm run migrate`');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
try {
  await client.connect();
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = await readFile(path.join(dir, file), 'utf8');
    await client.query(sql);
    console.log(`applied ${file}`);
  }
} catch (err) {
  console.error('migration failed:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
