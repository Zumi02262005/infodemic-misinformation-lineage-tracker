import express from 'express';
import { config } from '../config.js';
import { checkDatabase, isConnectionError, markDatabaseDown } from '../db/lifecycle.js';
import { describeDatabaseUrl } from '../db/pool.js';
import { examples } from '../db/seed-data.js';
import { MUTATION_TYPES } from '../nlp/mutation.js';
import { embeddings } from '../nlp/providers.js';
import { thresholds } from '../services/corpus.js';
import { deleteClaim, deleteNarrative, ingestClaim, ingestMany, moveClaim, rebuildAll } from '../services/lineage.js';
import {
  compareClaims,
  createDataset,
  exportNarrative,
  getClaimDetail,
  getGraph,
  getShowcase,
  getStats,
  listDatasets,
  listNarratives,
  searchClaims,
  updateNarrative,
} from '../services/queries.js';
import { state } from '../state.js';
import { parseCsv } from '../utils/csv.js';
import { HttpError, badRequest, parseId } from '../utils/http.js';

export const api = express.Router();

api.use(express.json({ limit: '5mb' }));

const body = (req) => (req.body && typeof req.body === 'object' ? req.body : {});

// ---- status (always available) ----
api.get('/health', async (req, res) => {
  await checkDatabase();
  res.json({
    ok: state.dbReady,
    database: {
      ready: state.dbReady,
      url: describeDatabaseUrl(),
      error: state.dbError?.message ?? null,
      hint: state.dbError?.hint ?? null,
    },
    nlp: embeddings.describe(),
    started_at: state.startedAt,
  });
});

api.get('/nlp', (req, res) => {
  res.json({ ...embeddings.describe(), thresholds: thresholds(), mutation_types: MUTATION_TYPES });
});

api.get('/examples', (req, res) => {
  res.json(examples);
});

// Everything below needs the database.
api.use((req, res, next) => {
  if (state.dbReady) return next();
  res.status(503).json({
    error: 'database_unavailable',
    message: state.dbError?.message ?? 'Connecting to PostgreSQL…',
    hint: state.dbError?.hint ?? 'The server retries every few seconds.',
  });
});

// ---- read ----
api.get('/stats', async (req, res) => res.json(await getStats()));
api.get('/narratives', async (req, res) => res.json(await listNarratives()));
api.get('/narratives/:id/export', async (req, res) => {
  const data = await exportNarrative(parseId(req.params.id));
  res.set('Content-Disposition', `attachment; filename="narrative-${data.narrative.id}.json"`);
  res.json(data);
});
api.get('/graph', async (req, res) => res.json(await getGraph(req.query.narrative)));
api.get('/claims/:id', async (req, res) => res.json(await getClaimDetail(parseId(req.params.id))));
api.get('/showcase', async (req, res) => {
  const id = req.query.narrative ? parseId(req.query.narrative, 'narrative') : null;
  res.json(await getShowcase(id));
});
api.get('/datasets', async (req, res) => res.json(await listDatasets()));
api.get('/search', async (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 8;
  res.json(await searchClaims(req.query.q, Number.isFinite(limit) ? limit : 8));
});

// ---- NLP ----
api.post('/similarity', async (req, res) => res.json(await compareClaims(body(req))));

// ---- write ----
api.post('/claims', async (req, res) => {
  const dryRun = req.query.dryRun === '1' || req.query.dryRun === 'true' || body(req).dry_run === true;
  const result = await ingestClaim(body(req), { dryRun });
  res.status(dryRun ? 200 : 201).json(result);
});

api.post('/claims/bulk', async (req, res) => {
  const b = body(req);
  let rows;
  if (Array.isArray(req.body)) rows = req.body;
  else if (Array.isArray(b.claims)) rows = b.claims;
  else if (typeof b.content === 'string') {
    const format = String(b.format || '').toLowerCase() || (b.content.trim().startsWith('[') || b.content.trim().startsWith('{') ? 'json' : 'csv');
    if (format === 'json') {
      let parsed;
      try {
        parsed = JSON.parse(b.content);
      } catch (err) {
        throw badRequest(`The JSON could not be parsed: ${err.message}`);
      }
      rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.claims) ? parsed.claims : null;
      if (!rows) throw badRequest('JSON imports must be a list of claims, or an object with a "claims" list');
    } else if (format === 'csv') {
      try {
        rows = parseCsv(b.content);
      } catch (err) {
        throw badRequest(`The CSV could not be parsed: ${err.message}`);
      }
      if (rows.length && !('text' in rows[0]) && !('claim' in rows[0])) {
        throw badRequest('The CSV needs a "text" column (see the sample file for the expected columns)');
      }
    } else {
      throw badRequest('"format" must be "csv" or "json"');
    }
  } else {
    throw badRequest('Send { "format": "csv" | "json", "content": "…" } or { "claims": [ … ] }');
  }
  res.json(await ingestMany(rows));
});

api.delete('/claims/:id', async (req, res) => res.json(await deleteClaim(parseId(req.params.id))));

api.patch('/claims/:id', async (req, res) => {
  const b = body(req);
  if (b.narrative_id === undefined) throw badRequest('Send { "narrative_id": <id> } or { "narrative_id": "new" }');
  const target = b.narrative_id === 'new' ? 'new' : parseId(b.narrative_id, 'narrative_id');
  res.json(await moveClaim(parseId(req.params.id), target));
});

api.patch('/narratives/:id', async (req, res) => res.json(await updateNarrative(parseId(req.params.id), body(req))));
api.delete('/narratives/:id', async (req, res) => res.json(await deleteNarrative(parseId(req.params.id))));
api.post('/datasets', async (req, res) => res.status(201).json(await createDataset(body(req))));
api.post('/lineage/rebuild', async (req, res) => res.json(await rebuildAll()));

api.use((req, res) => {
  res.status(404).json({ error: 'not_found', message: `No API route for ${req.method} ${req.baseUrl}${req.path}` });
});

// eslint-disable-next-line no-unused-vars
api.use((err, req, res, next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.status === 404 ? 'not_found' : 'bad_request', message: err.message, details: err.details });
  }
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'bad_request', message: 'The request body is not valid JSON' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'too_large', message: 'The request is too large (limit 5 MB)' });
  if (isConnectionError(err)) {
    markDatabaseDown(err);
    return res.status(503).json({
      error: 'database_unavailable',
      message: state.dbError?.message ?? 'The database connection was lost.',
      hint: state.dbError?.hint ?? 'The server reconnects automatically.',
    });
  }
  console.error('[api] unexpected error:', err);
  res.status(500).json({ error: 'server_error', message: config.isProduction ? 'Something went wrong on the server.' : err.message });
});
