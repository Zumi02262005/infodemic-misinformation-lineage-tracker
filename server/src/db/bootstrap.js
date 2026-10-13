import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config } from '../config.js';
import { pool, describeDatabaseUrl } from './pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_FILE = path.join(__dirname, 'schema.sql');

function databaseName(url) {
  const u = new URL(url);
  return decodeURIComponent(u.pathname.replace(/^\//, ''));
}

/**
 * Make sure the database named in DATABASE_URL exists, creating it through the
 * "postgres" maintenance database when it does not.
 * @returns {Promise<{created: boolean, name: string}>}
 */
export async function ensureDatabase(url = config.databaseUrl) {
  const name = databaseName(url);
  if (!name) throw new Error('DATABASE_URL must end with a database name, for example …/infodemic');

  const probe = new pg.Client({ connectionString: url, connectionTimeoutMillis: 8000 });
  try {
    await probe.connect();
    await probe.end();
    return { created: false, name };
  } catch (err) {
    if (err.code !== '3D000') throw err; // anything except "database does not exist"
  }

  if (!/^[A-Za-z0-9_-]+$/.test(name)) {
    throw new Error(`Database "${name}" does not exist. Create it manually; automatic creation only supports letters, digits, "_" and "-".`);
  }
  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: adminUrl.toString(), connectionTimeoutMillis: 8000 });
  try {
    await admin.connect();
  } catch (err) {
    err.message = `Database "${name}" does not exist, and connecting to the "postgres" database to create it failed: ${err.message}`;
    throw err;
  }
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    return { created: true, name };
  } catch (err) {
    if (err.code === '42P04') return { created: false, name }; // created concurrently
    if (err.code === '42501') {
      err.message = `Database "${name}" does not exist and this user may not create databases. Create it manually (for example: createdb ${name}) or use a user with CREATEDB.`;
    }
    throw err;
  } finally {
    await admin.end().catch(() => {});
  }
}

export async function applySchema() {
  const sql = fs.readFileSync(SCHEMA_FILE, 'utf8');
  await pool.query(sql);
}

export async function dropSchema() {
  await pool.query('DROP TABLE IF EXISTS claim_links, claims, narratives, datasets CASCADE');
}

export async function isEmpty() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM claims');
  return rows[0].n === 0;
}

/** Turn low-level connection errors into instructions a person can act on. */
export function explainDbError(err) {
  const where = describeDatabaseUrl();
  const code = err && err.code;
  const msg = (err && err.message) || String(err);
  if (code === 'ECONNREFUSED' || code === 'ECONNRESET' || /ECONNREFUSED/.test(msg)) {
    return {
      message: `PostgreSQL is not accepting connections at ${where}.`,
      hint: 'Start PostgreSQL (or run "docker compose up -d" in the project folder), then check DATABASE_URL in server/.env.',
    };
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return { message: `The database host in ${where} could not be found.`, hint: 'Check the host name in DATABASE_URL in server/.env.' };
  }
  if (code === '28P01' || code === '28000' || /password/i.test(msg)) {
    return {
      message: `PostgreSQL rejected the username or password for ${where}.`,
      hint: 'Put the correct user and password in DATABASE_URL in server/.env, for example postgres://postgres:YOUR_PASSWORD@localhost:5432/infodemic.',
    };
  }
  if (code === '3D000') {
    return { message: `The database in ${where} does not exist.`, hint: 'Create it with "createdb infodemic", or give the user permission to create databases.' };
  }
  if (/timeout/i.test(msg)) {
    return { message: `Timed out connecting to PostgreSQL at ${where}.`, hint: 'Check that PostgreSQL is running and that the host and port in DATABASE_URL are right.' };
  }
  return { message: msg, hint: 'Check DATABASE_URL in server/.env and that PostgreSQL is running.' };
}
