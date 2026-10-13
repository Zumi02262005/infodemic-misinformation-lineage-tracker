import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { config } from './config.js';
import { api } from './routes/api.js';

const NO_BUILD_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Infodemic API</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font:16px/1.6 system-ui,sans-serif;background:#070b18;color:#e8ecf8;display:grid;place-items:center;min-height:100vh;margin:0}
main{max-width:34rem;padding:2rem}code{background:#151d38;padding:.15rem .4rem;border-radius:6px}a{color:#56d8ff}</style></head>
<body><main><h1>The Infodemic API is running</h1>
<p>This port serves the API. Open the web app at <a href="http://localhost:5173">http://localhost:5173</a> while <code>npm run dev</code> is running.</p>
<p>To serve the app from this port instead, run <code>npm run build</code> and then <code>npm start</code>.</p>
<p>API status: <a href="/api/health">/api/health</a></p></main></body></html>`;

export function createApp() {
  const app = express();
  app.disable('x-powered-by');

  app.use('/api', api);

  // Production: serve the built React app and let it handle client-side routes.
  const indexHtml = path.join(config.clientDist, 'index.html');
  app.use(express.static(config.clientDist));
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (fs.existsSync(indexHtml)) return res.sendFile(indexHtml);
    if (req.path === '/') return res.type('html').send(NO_BUILD_PAGE);
    return next();
  });

  app.use((req, res) => {
    res.status(404).type('text/plain').send(`Not found: ${req.path}`);
  });

  return app;
}
