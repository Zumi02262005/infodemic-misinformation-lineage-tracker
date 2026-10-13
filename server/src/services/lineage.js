import { config } from '../config.js';
import { pool, transaction } from '../db/pool.js';
import { analyzeMutation, wordDiff } from '../nlp/mutation.js';
import { round } from '../nlp/engine.js';
import { HttpError, badRequest, notFound } from '../utils/http.js';
import { slugify, validateClaimInput } from '../utils/validate.js';
import { buildCorpus, getCorpus, invalidateCorpus, pairScore, rankText, thresholds } from './corpus.js';

// Lineage reconstruction.
//
// Within a narrative, claims are ordered by publication time. The earliest is the
// origin. Every later claim's parent is the MOST SIMILAR claim published before it,
// so the tree records which earlier wording each variant most likely came from.

// Writes are serialised so concurrent imports can't race on the same narrative.
let writeChain = Promise.resolve();
export function withWriteLock(fn) {
  const run = writeChain.then(fn, fn);
  writeChain = run.catch(() => {});
  return run;
}

/** Recompute parent, generation, similarity, drift and mutation labels for one narrative. */
export async function rebuildNarrative(db, corpus, narrativeId) {
  const { rows } = await db.query('SELECT id FROM claims WHERE narrative_id = $1 ORDER BY published_at, id', [narrativeId]);
  if (!rows.length) {
    await db.query('DELETE FROM narratives WHERE id = $1', [narrativeId]);
    return { claims: 0, removed: true };
  }
  const items = rows.map((r) => corpus.byId.get(r.id));
  if (items.some((it) => !it)) throw new Error('Corpus is out of date; rebuild it before updating lineage');

  const root = items[0];
  const generation = new Map([[root.id, 0]]);
  const update = {
    id: [root.id],
    parent: [null],
    generation: [0],
    similarity: [null],
    drift: [0],
    type: ['origin'],
    tags: [''],
    signals: [{}],
  };

  for (let j = 1; j < items.length; j++) {
    const child = items[j];
    let best = null;
    for (let i = 0; i < j; i++) {
      const s = pairScore(corpus, items[i], child).score;
      if (!best || s > best.score) best = { item: items[i], score: s };
    }
    const gen = generation.get(best.item.id) + 1;
    generation.set(child.id, gen);
    const fromRoot = pairScore(corpus, root, child).score;
    const analysis = analyzeMutation(best.item.text, child.text, best.score);
    update.id.push(child.id);
    update.parent.push(best.item.id);
    update.generation.push(gen);
    update.similarity.push(round(best.score));
    update.drift.push(round(Math.max(0, 1 - fromRoot)));
    update.type.push(analysis.type);
    update.tags.push(analysis.tags.join(','));
    update.signals.push({ summary: analysis.summary, ...analysis.signals });
  }

  await db.query(
    `UPDATE claims c
        SET parent_id = u.parent_id,
            generation = u.generation,
            similarity = u.similarity,
            drift = u.drift,
            mutation_type = u.mutation_type,
            mutation_tags = CASE WHEN u.tags = '' THEN '{}'::text[] ELSE string_to_array(u.tags, ',') END,
            mutation_signals = u.signals
       FROM unnest($1::int[], $2::int[], $3::int[], $4::real[], $5::real[], $6::text[], $7::text[], $8::jsonb[])
            AS u(id, parent_id, generation, similarity, drift, mutation_type, tags, signals)
      WHERE c.id = u.id`,
    [update.id, update.parent, update.generation, update.similarity, update.drift, update.type, update.tags, update.signals],
  );
  await db.query('UPDATE narratives SET updated_at = now() WHERE id = $1', [narrativeId]);
  return { claims: items.length, removed: false };
}

/**
 * Store "related" links: for each given claim, its top matches above the related
 * threshold that are not already its parent or child.
 */
export async function rebuildRelated(db, corpus, claimIds = null) {
  const { rows } = await db.query('SELECT id, parent_id FROM claims');
  const parentOf = new Map(rows.map((r) => [r.id, r.parent_id]));
  const isDerivation = (a, b) => parentOf.get(a) === b || parentOf.get(b) === a;
  const targets = claimIds ? claimIds.map((id) => corpus.byId.get(id)).filter(Boolean) : corpus.items;
  const { related } = thresholds();
  const perClaim = Math.max(0, Math.floor(config.nlp.relatedPerClaim));

  const links = new Map();
  for (const a of targets) {
    const scored = [];
    for (const b of corpus.items) {
      if (a.id === b.id || isDerivation(a.id, b.id)) continue;
      const s = pairScore(corpus, a, b).score;
      if (s >= related) scored.push([b.id, s]);
    }
    scored.sort((x, y) => y[1] - x[1]);
    for (const [bid, s] of scored.slice(0, perClaim)) {
      const key = a.id < bid ? `${a.id}-${bid}` : `${bid}-${a.id}`;
      links.set(key, s);
    }
  }

  if (claimIds) {
    await db.query('DELETE FROM claim_links WHERE source_id = ANY($1::int[]) OR target_id = ANY($1::int[])', [claimIds]);
  } else {
    await db.query('DELETE FROM claim_links');
  }
  if (links.size) {
    const src = [];
    const dst = [];
    const sim = [];
    for (const [key, s] of links) {
      const [x, y] = key.split('-').map(Number);
      src.push(x);
      dst.push(y);
      sim.push(round(s));
    }
    await db.query(
      `INSERT INTO claim_links (source_id, target_id, similarity)
       SELECT * FROM unnest($1::int[], $2::int[], $3::real[])
       ON CONFLICT (source_id, target_id) DO UPDATE SET similarity = EXCLUDED.similarity`,
      [src, dst, sim],
    );
  }
  return links.size;
}

/** Recompute every narrative's lineage and all related links. */
export async function rebuildAllLineage(db) {
  const corpus = await buildCorpus(db);
  const { rows } = await db.query('SELECT id FROM narratives ORDER BY id');
  let claims = 0;
  for (const r of rows) claims += (await rebuildNarrative(db, corpus, r.id)).claims;
  const links = await rebuildRelated(db, corpus);
  return { narratives: rows.length, claims, links };
}

export function rebuildAll() {
  return withWriteLock(async () => {
    const started = Date.now();
    const result = await transaction((db) => rebuildAllLineage(db));
    invalidateCorpus();
    return { ...result, ms: Date.now() - started };
  });
}

async function resolveDataset(db, input) {
  const ref = input.dataset;
  if (ref === null || ref === undefined) return null;
  if (typeof ref === 'number') {
    const { rows } = await db.query('SELECT id FROM datasets WHERE id = $1', [ref]);
    if (!rows.length) throw badRequest(`Dataset ${ref} does not exist`);
    return rows[0].id;
  }
  const slug = slugify(ref);
  const found = await db.query('SELECT id FROM datasets WHERE slug = $1 OR lower(name) = lower($2) LIMIT 1', [slug, ref]);
  if (found.rows.length) return found.rows[0].id;
  const created = await db.query(
    `INSERT INTO datasets (slug, name, kind) VALUES ($1, $2, $3)
     ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug RETURNING id`,
    [slug, ref, input.dataset_kind || 'other'],
  );
  return created.rows[0].id;
}

/** A readable narrative title from the first sentence of a claim. */
export function titleFromText(text) {
  const first = String(text).split(/(?<=[.!?])\s/)[0].replace(/[.!?:;,\s]+$/, '');
  if (first.length <= 80) return first;
  const cut = first.slice(0, 80);
  return cut.slice(0, cut.lastIndexOf(' ') > 40 ? cut.lastIndexOf(' ') : 80).replace(/[,;:\s]+$/, '') + '…';
}

const candidateView = (r, narratives) => ({
  id: r.item.id,
  text: r.item.text,
  narrative_id: r.item.narrativeId,
  narrative_title: narratives.get(r.item.narrativeId) ?? null,
  published_at: r.item.publishedAt.toISOString(),
  score: round(r.score),
  lexical: round(r.lexical),
  character: round(r.character),
  semantic: round(r.semantic),
});

async function narrativeTitles(db) {
  const { rows } = await db.query('SELECT id, title FROM narratives');
  return new Map(rows.map((r) => [r.id, r.title]));
}

/**
 * Work out where a claim belongs without saving it: which narrative it joins
 * (or whether it starts a new one) and which earlier claim it most resembles.
 */
async function planIngest(input, corpus, db) {
  const ranked = await rankText(corpus, input.text);
  const titles = await narrativeTitles(db);
  const { link } = thresholds();
  const best = ranked[0] || null;

  let narrativeId = null;
  let decision = 'new-narrative';
  let reason;
  if (input.narrative_id) {
    if (!titles.has(input.narrative_id)) throw badRequest(`Narrative ${input.narrative_id} does not exist`);
    narrativeId = input.narrative_id;
    decision = 'linked';
    reason = 'manual';
  } else if (!input.force_new && best && best.score >= link) {
    narrativeId = best.item.narrativeId;
    decision = 'linked';
    reason = 'similarity';
  } else {
    reason = input.force_new ? 'manual' : best ? 'below-threshold' : 'empty-corpus';
  }

  let parent = null;
  if (narrativeId) {
    const inNarrative = ranked.filter((r) => r.item.narrativeId === narrativeId);
    parent = inNarrative.find((r) => r.item.publishedAt <= input.published_at) || null;
  }
  const analysis = parent ? analyzeMutation(parent.item.text, input.text, parent.score) : null;

  return {
    decision,
    reason,
    threshold: link,
    narrative: narrativeId ? { id: narrativeId, title: titles.get(narrativeId) } : { id: null, title: titleFromText(input.text) },
    best_match: best ? candidateView(best, titles) : null,
    parent: parent ? candidateView(parent, titles) : null,
    similarity: parent ? round(parent.score) : null,
    analysis,
    diff: parent ? wordDiff(parent.item.text, input.text) : null,
    becomes_origin: Boolean(narrativeId && !parent),
    candidates: ranked.slice(0, 5).map((r) => candidateView(r, titles)),
  };
}

/** Insert one already-validated claim and update lineage. Caller holds the write lock. */
async function insertClaim(input, plan) {
  const id = await transaction(async (db) => {
    const datasetId = await resolveDataset(db, input);
    let narrativeId = plan.narrative.id;
    if (!narrativeId) {
      const n = await db.query(`INSERT INTO narratives (title, verdict) VALUES ($1, 'unverified') RETURNING id`, [plan.narrative.title]);
      narrativeId = n.rows[0].id;
    }
    const c = await db.query(
      `INSERT INTO claims (narrative_id, dataset_id, text, author, source_url, region, language, reach, published_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [narrativeId, datasetId, input.text, input.author, input.source_url, input.region, input.language, input.reach, input.published_at.toISOString()],
    );
    const claimId = c.rows[0].id;
    const corpus = await buildCorpus(db);
    await rebuildNarrative(db, corpus, narrativeId);
    await rebuildRelated(db, corpus, [claimId]);
    return claimId;
  });
  invalidateCorpus();
  return id;
}

export async function ingestClaim(body, { dryRun = false } = {}) {
  const input = validateClaimInput(body);
  return withWriteLock(async () => {
    const corpus = await getCorpus();
    const plan = await planIngest(input, corpus, pool);
    if (dryRun) return { dry_run: true, ...plan };
    const id = await insertClaim(input, plan);
    const { rows } = await pool.query('SELECT narrative_id, parent_id, similarity, generation, mutation_type FROM claims WHERE id = $1', [id]);
    const saved = rows[0];
    return {
      dry_run: false,
      ...plan,
      claim: { id, ...saved },
      narrative: { id: saved.narrative_id, title: plan.narrative.title },
    };
  });
}

/** Import many claims in chronological order. Each row is matched against everything before it. */
export async function ingestMany(rows) {
  if (!Array.isArray(rows)) throw badRequest('Expected a list of claims');
  if (!rows.length) throw badRequest('The import contains no rows');
  if (rows.length > 1000) throw badRequest('Import at most 1,000 claims at a time');

  const results = [];
  const valid = [];
  rows.forEach((row, index) => {
    try {
      valid.push({ index, input: validateClaimInput(row) });
    } catch (err) {
      results.push({ row: index + 1, status: 'error', error: err.message });
    }
  });
  valid.sort((a, b) => a.input.published_at - b.input.published_at || a.index - b.index);

  return withWriteLock(async () => {
    for (const { index, input } of valid) {
      try {
        const corpus = await getCorpus();
        const plan = await planIngest(input, corpus, pool);
        const id = await insertClaim(input, plan);
        const { rows: saved } = await pool.query(
          `SELECT c.narrative_id, c.similarity, c.mutation_type, n.title
             FROM claims c JOIN narratives n ON n.id = c.narrative_id WHERE c.id = $1`,
          [id],
        );
        results.push({
          row: index + 1,
          status: plan.decision,
          claim_id: id,
          narrative_id: saved[0].narrative_id,
          narrative_title: saved[0].title,
          similarity: saved[0].similarity === null ? null : round(saved[0].similarity),
          mutation_type: saved[0].mutation_type,
          text: input.text,
        });
      } catch (err) {
        results.push({ row: index + 1, status: 'error', error: err instanceof HttpError ? err.message : `Could not save: ${err.message}` });
      }
    }
    results.sort((a, b) => a.row - b.row);
    const count = (s) => results.filter((r) => r.status === s).length;
    return {
      total: rows.length,
      linked: count('linked'),
      new_narratives: count('new-narrative'),
      errors: count('error'),
      results,
    };
  });
}

export async function deleteClaim(id) {
  return withWriteLock(async () => {
    const result = await transaction(async (db) => {
      const { rows } = await db.query('DELETE FROM claims WHERE id = $1 RETURNING narrative_id', [id]);
      if (!rows.length) throw notFound(`Claim ${id} does not exist`);
      const narrativeId = rows[0].narrative_id;
      const corpus = await buildCorpus(db);
      const rebuilt = await rebuildNarrative(db, corpus, narrativeId);
      return { deleted: id, narrative_id: narrativeId, narrative_removed: rebuilt.removed };
    });
    invalidateCorpus();
    return result;
  });
}

export async function deleteNarrative(id) {
  return withWriteLock(async () => {
    const { rowCount } = await pool.query('DELETE FROM narratives WHERE id = $1', [id]);
    if (!rowCount) throw notFound(`Narrative ${id} does not exist`);
    invalidateCorpus();
    return { deleted: id };
  });
}

/** Explicitly move a claim to another narrative (an analyst correcting the engine). */
export async function moveClaim(id, narrativeId) {
  return withWriteLock(async () => {
    const result = await transaction(async (db) => {
      const { rows } = await db.query('SELECT narrative_id FROM claims WHERE id = $1', [id]);
      if (!rows.length) throw notFound(`Claim ${id} does not exist`);
      const from = rows[0].narrative_id;
      let to = narrativeId;
      if (to === 'new') {
        const t = await db.query('SELECT text FROM claims WHERE id = $1', [id]);
        const n = await db.query(`INSERT INTO narratives (title, verdict) VALUES ($1, 'unverified') RETURNING id`, [titleFromText(t.rows[0].text)]);
        to = n.rows[0].id;
      } else {
        const n = await db.query('SELECT id FROM narratives WHERE id = $1', [to]);
        if (!n.rows.length) throw badRequest(`Narrative ${to} does not exist`);
      }
      if (to === from) return { id, narrative_id: to, moved: false };
      await db.query('UPDATE claims SET narrative_id = $2, parent_id = NULL WHERE id = $1', [id, to]);
      const corpus = await buildCorpus(db);
      await rebuildNarrative(db, corpus, from);
      await rebuildNarrative(db, corpus, to);
      await rebuildRelated(db, corpus, [id]);
      return { id, narrative_id: to, moved: true };
    });
    invalidateCorpus();
    return result;
  });
}
