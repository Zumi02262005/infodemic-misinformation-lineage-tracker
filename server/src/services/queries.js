import { pool } from '../db/pool.js';
import { round } from '../nlp/engine.js';
import { analyzeMutation, wordDiff } from '../nlp/mutation.js';
import { sharedTerms } from '../nlp/text.js';
import { badRequest, notFound } from '../utils/http.js';
import { slugify, validateDatasetInput, validateNarrativePatch } from '../utils/validate.js';
import { compareTexts, getCorpus, rankText, thresholds } from './corpus.js';
import { withWriteLock } from './lineage.js';

const iso = (d) => (d ? new Date(d).toISOString() : null);

const CLAIM_COLUMNS = `
  c.id, c.narrative_id, c.parent_id, c.dataset_id, c.text, c.author, c.source_url, c.region, c.language,
  c.reach, c.published_at, c.similarity, c.drift, c.generation, c.mutation_type, c.mutation_tags,
  c.mutation_signals, c.created_at, d.name AS dataset_name, d.kind AS dataset_kind`;

function claimView(r) {
  return {
    id: r.id,
    narrative_id: r.narrative_id,
    parent_id: r.parent_id,
    dataset_id: r.dataset_id,
    dataset_name: r.dataset_name ?? null,
    dataset_kind: r.dataset_kind ?? null,
    text: r.text,
    author: r.author,
    source_url: r.source_url,
    region: r.region,
    language: r.language,
    reach: r.reach,
    published_at: iso(r.published_at),
    similarity: r.similarity === null ? null : round(r.similarity),
    drift: r.drift === null ? null : round(r.drift),
    generation: r.generation,
    mutation_type: r.mutation_type,
    mutation_tags: r.mutation_tags || [],
    summary: r.mutation_signals?.summary ?? null,
  };
}

export async function listNarratives() {
  const [{ rows: narratives }, { rows: claims }] = await Promise.all([
    pool.query(
      `SELECT n.*,
              COUNT(c.id)::int AS claim_count,
              COALESCE(SUM(c.reach), 0)::float8 AS reach,
              MIN(c.published_at) AS first_seen,
              MAX(c.published_at) AS last_seen,
              COALESCE(MAX(c.generation), 0)::int AS generations,
              COUNT(DISTINCT c.dataset_id)::int AS datasets,
              COUNT(DISTINCT c.region)::int AS regions
         FROM narratives n
         LEFT JOIN claims c ON c.narrative_id = n.id
        GROUP BY n.id
        ORDER BY reach DESC, n.id`,
    ),
    pool.query(
      `SELECT id, narrative_id, parent_id, published_at, mutation_type, reach, generation
         FROM claims ORDER BY published_at, id`,
    ),
  ]);
  const byNarrative = new Map();
  for (const c of claims) {
    if (!byNarrative.has(c.narrative_id)) byNarrative.set(c.narrative_id, []);
    byNarrative.get(c.narrative_id).push({
      id: c.id,
      parent_id: c.parent_id,
      published_at: iso(c.published_at),
      mutation_type: c.mutation_type,
      reach: c.reach,
      generation: c.generation,
    });
  }
  return narratives.map((n) => {
    const list = byNarrative.get(n.id) || [];
    const mutations = {};
    for (const c of list) mutations[c.mutation_type] = (mutations[c.mutation_type] || 0) + 1;
    return {
      id: n.id,
      title: n.title,
      summary: n.summary,
      category: n.category,
      verdict: n.verdict,
      fact_check: n.fact_check,
      created_at: iso(n.created_at),
      updated_at: iso(n.updated_at),
      stats: {
        claims: n.claim_count,
        reach: n.reach,
        first_seen: iso(n.first_seen),
        last_seen: iso(n.last_seen),
        generations: n.generations,
        datasets: n.datasets,
        regions: n.regions,
        mutations,
      },
      claims: list,
    };
  });
}

async function narrativeById(id) {
  const { rows } = await pool.query('SELECT * FROM narratives WHERE id = $1', [id]);
  if (!rows.length) throw notFound(`Narrative ${id} does not exist`);
  const n = rows[0];
  return { ...n, created_at: iso(n.created_at), updated_at: iso(n.updated_at) };
}

/** Nodes and links for the lineage graph: one narrative, or every narrative ("all"). */
export async function getGraph(narrativeParam) {
  const all = narrativeParam === undefined || narrativeParam === 'all' || narrativeParam === '';
  let narrative = null;
  let nodesRes;
  if (all) {
    nodesRes = await pool.query(`SELECT ${CLAIM_COLUMNS} FROM claims c LEFT JOIN datasets d ON d.id = c.dataset_id ORDER BY c.published_at, c.id`);
  } else {
    const id = Number(narrativeParam);
    if (!Number.isInteger(id) || id <= 0) throw badRequest('"narrative" must be "all" or a narrative id');
    narrative = await narrativeById(id);
    nodesRes = await pool.query(
      `SELECT ${CLAIM_COLUMNS} FROM claims c LEFT JOIN datasets d ON d.id = c.dataset_id
        WHERE c.narrative_id = $1 ORDER BY c.published_at, c.id`,
      [id],
    );
  }
  const nodes = nodesRes.rows.map(claimView);
  const ids = new Set(nodes.map((n) => n.id));
  const links = nodes
    .filter((n) => n.parent_id && ids.has(n.parent_id))
    .map((n) => ({ source: n.parent_id, target: n.id, kind: 'derivation', similarity: n.similarity }));
  const derivation = new Set(links.map((l) => `${Math.min(l.source, l.target)}-${Math.max(l.source, l.target)}`));
  const { rows: rel } = await pool.query(
    all
      ? 'SELECT source_id, target_id, similarity FROM claim_links'
      : `SELECT l.source_id, l.target_id, l.similarity FROM claim_links l
           JOIN claims a ON a.id = l.source_id JOIN claims b ON b.id = l.target_id
          WHERE a.narrative_id = $1 AND b.narrative_id = $1`,
    all ? undefined : [narrative.id],
  );
  for (const r of rel) {
    if (!ids.has(r.source_id) || !ids.has(r.target_id)) continue;
    if (derivation.has(`${r.source_id}-${r.target_id}`)) continue;
    links.push({ source: r.source_id, target: r.target_id, kind: 'related', similarity: round(r.similarity) });
  }
  const { rows: narratives } = await pool.query('SELECT id, title, verdict, category FROM narratives ORDER BY id');
  return { narrative, nodes, links, narratives };
}

export async function getClaimDetail(id) {
  const { rows } = await pool.query(`SELECT ${CLAIM_COLUMNS} FROM claims c LEFT JOIN datasets d ON d.id = c.dataset_id WHERE c.id = $1`, [id]);
  if (!rows.length) throw notFound(`Claim ${id} does not exist`);
  const claim = claimView(rows[0]);
  const signals = rows[0].mutation_signals || {};

  const [pathRes, childrenRes, relatedRes, narrative] = await Promise.all([
    pool.query(
      `WITH RECURSIVE chain AS (
         SELECT id, parent_id, 0 AS depth FROM claims WHERE id = $1
         UNION ALL
         SELECT c.id, c.parent_id, chain.depth + 1 FROM claims c JOIN chain ON c.id = chain.parent_id WHERE chain.depth < 1000
       )
       SELECT ${CLAIM_COLUMNS}, chain.depth FROM chain
         JOIN claims c ON c.id = chain.id LEFT JOIN datasets d ON d.id = c.dataset_id
        ORDER BY chain.depth DESC`,
      [id],
    ),
    pool.query(`SELECT ${CLAIM_COLUMNS} FROM claims c LEFT JOIN datasets d ON d.id = c.dataset_id WHERE c.parent_id = $1 ORDER BY c.published_at, c.id`, [id]),
    pool.query(
      `SELECT ${CLAIM_COLUMNS}, l.similarity AS link_similarity, n.title AS narrative_title
         FROM claim_links l
         JOIN claims c ON c.id = CASE WHEN l.source_id = $1 THEN l.target_id ELSE l.source_id END
         JOIN narratives n ON n.id = c.narrative_id
         LEFT JOIN datasets d ON d.id = c.dataset_id
        WHERE l.source_id = $1 OR l.target_id = $1
        ORDER BY l.similarity DESC LIMIT 8`,
      [id],
    ),
    narrativeById(claim.narrative_id),
  ]);

  const path = pathRes.rows.map(claimView);
  const parent = path.length > 1 ? path[path.length - 2] : null;
  const children = childrenRes.rows.map(claimView);
  const related = relatedRes.rows
    .filter((r) => r.id !== claim.parent_id && r.parent_id !== claim.id)
    .map((r) => ({ ...claimView(r), narrative_title: r.narrative_title, link_similarity: round(r.link_similarity) }));

  const { summary, ...rest } = signals;
  return {
    claim,
    narrative,
    parent,
    root: path[0],
    path,
    children,
    related,
    mutation: parent ? { type: claim.mutation_type, tags: claim.mutation_tags, summary: summary ?? null, signals: rest } : null,
    diff: parent ? wordDiff(parent.text, claim.text) : null,
  };
}

export async function getStats() {
  const [totals, mutations, datasets, recent] = await Promise.all([
    pool.query(
      `SELECT (SELECT COUNT(*) FROM narratives)::int AS narratives,
              (SELECT COUNT(*) FROM claims)::int AS claims,
              (SELECT COUNT(*) FROM datasets)::int AS datasets,
              (SELECT COUNT(DISTINCT region) FROM claims WHERE region IS NOT NULL AND region <> '')::int AS regions,
              (SELECT COALESCE(SUM(reach), 0) FROM claims)::float8 AS reach,
              (SELECT COALESCE(MAX(generation), 0) FROM claims)::int AS max_generation,
              (SELECT MIN(published_at) FROM claims) AS first_seen,
              (SELECT MAX(published_at) FROM claims) AS last_seen`,
    ),
    pool.query('SELECT mutation_type, COUNT(*)::int AS count FROM claims GROUP BY mutation_type ORDER BY count DESC'),
    pool.query(
      `SELECT d.id, d.slug, d.name, d.kind, d.description, d.url,
              COUNT(c.id)::int AS claims, COALESCE(SUM(c.reach), 0)::float8 AS reach
         FROM datasets d LEFT JOIN claims c ON c.dataset_id = d.id
        GROUP BY d.id ORDER BY claims DESC, d.name`,
    ),
    pool.query(
      `SELECT ${CLAIM_COLUMNS}, n.title AS narrative_title
         FROM claims c JOIN narratives n ON n.id = c.narrative_id LEFT JOIN datasets d ON d.id = c.dataset_id
        ORDER BY c.created_at DESC, c.published_at DESC, c.id DESC LIMIT 6`,
    ),
  ]);
  const t = totals.rows[0];
  return {
    totals: { ...t, first_seen: iso(t.first_seen), last_seen: iso(t.last_seen) },
    mutations: Object.fromEntries(mutations.rows.map((r) => [r.mutation_type, r.count])),
    datasets: datasets.rows,
    recent: recent.rows.map((r) => ({ ...claimView(r), narrative_title: r.narrative_title })),
  };
}

/**
 * The longest origin-to-variant chain, used by the Overview hero to replay how a
 * claim mutated generation by generation.
 */
export async function getShowcase(narrativeId) {
  const params = [];
  let where = '';
  if (narrativeId) {
    params.push(narrativeId);
    where = 'WHERE c.narrative_id = $1';
  }
  const { rows } = await pool.query(
    `SELECT c.id FROM claims c ${where} ORDER BY c.generation DESC, c.reach DESC, c.id LIMIT 12`,
    params,
  );
  if (!rows.length) return null;
  // Of the deepest leaves, prefer the chain whose steps share the most wording,
  // which makes for the clearest step-by-step replay.
  let best = null;
  for (const r of rows) {
    const detail = await getClaimDetail(r.id);
    if (best && detail.path.length < best.path.length) continue;
    const sims = detail.path.slice(1).map((p) => p.similarity ?? 0);
    const avg = sims.length ? sims.reduce((a, b) => a + b, 0) / sims.length : 0;
    if (!best || detail.path.length > best.path.length || avg > best.avg) best = { path: detail.path, narrative: detail.narrative, avg };
  }
  const steps = best.path.map((p, i) => ({
    ...p,
    diff: i === 0 ? null : wordDiff(best.path[i - 1].text, p.text),
  }));
  return { narrative: best.narrative, steps };
}

export async function listDatasets() {
  const { rows } = await pool.query(
    `SELECT d.id, d.slug, d.name, d.kind, d.description, d.url, COUNT(c.id)::int AS claims
       FROM datasets d LEFT JOIN claims c ON c.dataset_id = d.id GROUP BY d.id ORDER BY d.name`,
  );
  return rows;
}

export async function createDataset(body) {
  const input = validateDatasetInput(body);
  const slug = slugify(input.name);
  const { rows } = await pool.query(
    `INSERT INTO datasets (slug, name, kind, description, url) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (slug) DO NOTHING RETURNING id, slug, name, kind, description, url`,
    [slug, input.name, input.kind, input.description, input.url],
  );
  if (!rows.length) throw badRequest(`A dataset named "${input.name}" already exists`);
  return { ...rows[0], claims: 0 };
}

export async function updateNarrative(id, body) {
  const patch = validateNarrativePatch(body);
  return withWriteLock(async () => {
    const keys = Object.keys(patch);
    const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const { rows } = await pool.query(
      `UPDATE narratives SET ${sets}, updated_at = now() WHERE id = $1 RETURNING *`,
      [id, ...keys.map((k) => patch[k])],
    );
    if (!rows.length) throw notFound(`Narrative ${id} does not exist`);
    return { ...rows[0], created_at: iso(rows[0].created_at), updated_at: iso(rows[0].updated_at) };
  });
}

export async function exportNarrative(id) {
  const narrative = await narrativeById(id);
  const { rows } = await pool.query(
    `SELECT ${CLAIM_COLUMNS} FROM claims c LEFT JOIN datasets d ON d.id = c.dataset_id WHERE c.narrative_id = $1 ORDER BY c.published_at, c.id`,
    [id],
  );
  return { exported_at: new Date().toISOString(), narrative, claims: rows.map(claimView) };
}

export async function searchClaims(q, limit = 8) {
  const text = String(q ?? '').trim();
  if (text.length < 2) return { query: text, results: [] };
  const corpus = await getCorpus();
  const ranked = await rankText(corpus, text.slice(0, 2000));
  const lower = text.toLowerCase();
  const { rows: narratives } = await pool.query('SELECT id, title FROM narratives');
  const titles = new Map(narratives.map((n) => [n.id, n.title]));
  const results = ranked
    .map((r) => ({ ...r, contains: r.item.text.toLowerCase().includes(lower) }))
    .filter((r) => r.contains || r.score >= 0.05)
    .sort((a, b) => Number(b.contains) - Number(a.contains) || b.score - a.score)
    .slice(0, Math.min(Math.max(1, limit), 25))
    .map((r) => ({
      id: r.item.id,
      text: r.item.text,
      narrative_id: r.item.narrativeId,
      narrative_title: titles.get(r.item.narrativeId) ?? null,
      published_at: r.item.publishedAt.toISOString(),
      score: round(r.score),
      exact: r.contains,
    }));
  return { query: text, results };
}

export async function compareClaims(body) {
  const a = String(body?.a ?? '').trim();
  const b = String(body?.b ?? '').trim();
  if (a.length < 3 || b.length < 3) throw badRequest('Provide two texts, "a" and "b", of at least 3 characters each');
  if (a.length > 2000 || b.length > 2000) throw badRequest('Each text must be 2,000 characters or fewer');
  const corpus = await getCorpus();
  const s = await compareTexts(corpus, a, b);
  const { link, related } = thresholds();
  const verdict = s.score >= link ? 'same-lineage' : s.score >= related * 0.6 ? 'related' : 'distinct';
  return {
    score: round(s.score),
    verdict,
    thresholds: { link, related },
    breakdown: { lexical: round(s.lexical), character: round(s.character), semantic: round(s.semantic) },
    shared_terms: sharedTerms(a, b),
    analysis: analyzeMutation(a, b, s.score),
    diff: wordDiff(a, b),
  };
}
