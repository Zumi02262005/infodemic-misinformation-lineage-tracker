import { config } from '../config.js';
import { state } from '../state.js';
import { applySchema, ensureDatabase, explainDbError, isEmpty } from './bootstrap.js';
import { describeDatabaseUrl, pool } from './pool.js';
import { seedDatabase } from './seed.js';

// Keeps the API usable while PostgreSQL is missing or restarts: the server starts
// anyway, reports the problem at /api/health, and reconnects on its own.

const RETRY_MS = 5000;
let retryTimer = null;
let initializing = false;
let lastLoggedError = null;

function scheduleRetry() {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(initDatabase, RETRY_MS);
}

export async function initDatabase() {
  if (initializing) return;
  initializing = true;
  try {
    const { created, name } = await ensureDatabase();
    if (created) console.log(`[db] Created database "${name}".`);
    await applySchema();
    if (config.autoSeed && (await isEmpty())) {
      console.log('[db] Database is empty. Loading the demo dataset…');
      const r = await seedDatabase();
      state.seededOnBoot = true;
      console.log(`[db] Loaded ${r.claims} claims in ${r.narratives} narratives (${r.links} similarity links).`);
    }
    state.dbReady = true;
    state.dbError = null;
    lastLoggedError = null;
    console.log(`[db] Connected to ${describeDatabaseUrl()}`);
  } catch (err) {
    state.dbReady = false;
    state.dbError = explainDbError(err);
    if (lastLoggedError !== state.dbError.message) {
      lastLoggedError = state.dbError.message;
      console.error(`\n[db] ${state.dbError.message}\n[db] ${state.dbError.hint}\n[db] Retrying every ${RETRY_MS / 1000}s. The web app shows this message until it connects.\n`);
    }
    scheduleRetry();
  } finally {
    initializing = false;
  }
}

/** Called when a request fails because the connection was lost. */
export function markDatabaseDown(err) {
  if (!state.dbReady) return;
  state.dbReady = false;
  state.dbError = explainDbError(err);
  lastLoggedError = state.dbError.message;
  console.error(`\n[db] Lost the database connection: ${state.dbError.message}\n[db] Reconnecting every ${RETRY_MS / 1000}s.\n`);
  scheduleRetry();
}

/** Live check used by /api/health, so the UI notices a database that went away. */
export async function checkDatabase() {
  if (!state.dbReady) return false;
  try {
    await Promise.race([
      pool.query('SELECT 1'),
      new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('Database health check timed out'), { code: 'ETIMEDOUT' })), 4000)),
    ]);
    return true;
  } catch (err) {
    markDatabaseDown(err);
    return false;
  }
}

export function stopDatabaseRetries() {
  clearTimeout(retryTimer);
}

/** True for errors that mean "the database is unreachable", not "the query was wrong". */
export function isConnectionError(err) {
  const code = String(err?.code || '');
  return /^(08|57P|53)/.test(code) || /^(ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EPIPE)/.test(code) || /Connection terminated|not queryable|connect ECONNREFUSED/i.test(err?.message || '');
}
