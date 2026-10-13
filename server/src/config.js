import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SERVER_ROOT = path.resolve(__dirname, '..');
export const PROJECT_ROOT = path.resolve(SERVER_ROOT, '..');

/** Minimal .env loader: KEY=VALUE lines, # comments, optional quotes. Real env vars win. */
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return false;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim().replace(/^export\s+/, '');
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      const hash = value.indexOf(' #');
      if (hash !== -1) value = value.slice(0, hash).trim();
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
  return true;
}

export const envFileLoaded = loadEnvFile(path.join(SERVER_ROOT, '.env'));

const env = process.env;
const num = (v, d) => {
  const n = Number(v);
  return v === undefined || v === '' || Number.isNaN(n) ? d : n;
};
const bool = (v, d) => (v === undefined || v === '' ? d : !/^(0|false|no|off)$/i.test(String(v)));

const provider = String(env.NLP_PROVIDER || 'local').toLowerCase();

export const config = {
  isProduction: env.NODE_ENV === 'production',
  port: num(env.PORT, 4000),
  host: env.HOST || '127.0.0.1',
  databaseUrl: env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/infodemic',
  autoSeed: bool(env.AUTO_SEED, true),
  clientDist: path.join(PROJECT_ROOT, 'client', 'dist'),
  nlp: {
    provider: ['local', 'openai', 'huggingface'].includes(provider) ? provider : 'local',
    requestedProvider: provider,
    linkThreshold: num(env.LINK_THRESHOLD, 0.22),
    relatedThreshold: num(env.RELATED_THRESHOLD, 0.2),
    relatedPerClaim: num(env.RELATED_PER_CLAIM, 2),
    semanticWeight: num(env.SEMANTIC_WEIGHT, 0.6),
    semanticFloor: env.SEMANTIC_FLOOR,
    openai: {
      apiKey: env.OPENAI_API_KEY || '',
      baseUrl: (env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
      model: env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
    },
    huggingface: {
      token: env.HF_API_TOKEN || '',
      model: env.HF_MODEL || 'sentence-transformers/all-MiniLM-L6-v2',
      url: env.HF_API_URL || '',
    },
  },
};
