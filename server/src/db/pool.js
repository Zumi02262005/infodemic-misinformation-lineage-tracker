import pg from 'pg';
import { config } from '../config.js';

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 8000,
});

// An idle client can error if the server restarts; log it instead of crashing.
pool.on('error', (err) => {
  console.error('[db] idle connection error:', err.message);
});

export function query(text, params) {
  return pool.query(text, params);
}

/** Run `fn(client)` inside a transaction. Commits on success, rolls back on error. */
export async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // The connection may already be gone; the original error matters more.
    }
    throw err;
  } finally {
    client.release();
  }
}

/** Describe a database URL without its password, for logs and the UI. */
export function describeDatabaseUrl(url = config.databaseUrl) {
  try {
    const u = new URL(url);
    const user = u.username ? decodeURIComponent(u.username) + '@' : '';
    return `${u.protocol}//${user}${u.hostname}:${u.port || 5432}${u.pathname}`;
  } catch {
    return '(invalid DATABASE_URL)';
  }
}
