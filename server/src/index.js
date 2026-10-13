import http from 'node:http';
import { config, envFileLoaded } from './config.js';
import { createApp } from './app.js';
import { initDatabase, stopDatabaseRetries } from './db/lifecycle.js';
import { pool } from './db/pool.js';
import { embeddings } from './nlp/providers.js';

const app = createApp();
const server = http.createServer(app);

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[api] Port ${config.port} is already in use. Stop the other process or set PORT in server/.env (and the proxy target in client/vite.config.js).\n`);
    process.exit(1);
  }
  throw err;
});

server.listen(config.port, config.host, () => {
  const nlp = embeddings.describe();
  console.log(`[api] Infodemic API listening on http://localhost:${config.port}  (bound to ${config.host})`);
  console.log(`[api] Settings: ${envFileLoaded ? 'server/.env' : 'defaults (no server/.env found)'}; NLP: ${nlp.provider}${nlp.model ? ` (${nlp.model})` : ''}`);
  initDatabase();
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  stopDatabaseRetries();
  console.log(`\n[api] ${signal} received, shutting down…`);
  server.close();
  await pool.end().catch(() => {});
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
