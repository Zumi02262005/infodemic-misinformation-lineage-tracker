import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { CorpusModel, blendScore, cosineArrays, localSimilarity } from '../nlp/engine.js';
import { extractFeatures } from '../nlp/text.js';
import { embeddings } from '../nlp/providers.js';

// The corpus is every stored claim, vectorised against IDF statistics learned from
// the whole collection. It is cached for reads and rebuilt after each write.

const featureCache = new Map(); // claim id -> { text, features }
let cached = null;

function featuresFor(id, text) {
  const hit = featureCache.get(id);
  if (hit && hit.text === text) return hit.features;
  const features = extractFeatures(text);
  featureCache.set(id, { text, features });
  return features;
}

export function invalidateCorpus() {
  cached = null;
}

/** Fill in missing embeddings (when a provider is configured). Never throws. */
async function ensureEmbeddings(db, corpus) {
  if (!embeddings.enabled || embeddings.coolingDown()) return false;
  const model = embeddings.model;
  const missing = corpus.items.filter((it) => !it.embedding || it.embeddingModel !== model);
  if (missing.length) {
    try {
      const vectors = await embeddings.embed(missing.map((it) => it.text));
      for (let i = 0; i < missing.length; i++) {
        missing[i].embedding = vectors[i];
        missing[i].embeddingModel = model;
      }
      await db.query(
        `UPDATE claims c SET embedding = u.embedding, embedding_model = $3
           FROM (SELECT unnest($1::int[]) AS id, unnest($2::text[])::real[] AS embedding) u
          WHERE c.id = u.id`,
        [missing.map((it) => it.id), vectors.map((v) => `{${v.join(',')}}`), model],
      );
    } catch {
      return false;
    }
  }
  return corpus.items.every((it) => it.embedding && it.embeddingModel === model);
}

/** Load every claim and vectorise it. Pass a transaction client to see uncommitted rows. */
export async function buildCorpus(db = pool) {
  const { rows } = await db.query(
    `SELECT id, narrative_id, parent_id, text, published_at, embedding, embedding_model
       FROM claims ORDER BY published_at, id`,
  );
  const model = new CorpusModel();
  const feats = rows.map((r) => featuresFor(r.id, r.text));
  feats.forEach((f) => model.addDocument(f));
  const items = rows.map((r, i) => ({
    id: r.id,
    narrativeId: r.narrative_id,
    parentId: r.parent_id,
    text: r.text,
    publishedAt: new Date(r.published_at),
    vec: model.vectorize(feats[i]),
    embedding: r.embedding,
    embeddingModel: r.embedding_model,
  }));
  const corpus = { model, items, byId: new Map(items.map((it) => [it.id, it])), semantic: false };
  corpus.semantic = await ensureEmbeddings(db, corpus);
  return corpus;
}

async function fingerprint(db) {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS n, COALESCE(SUM(id), 0)::float8 AS ids,
            COALESCE(SUM(id::float8 * narrative_id), 0)::float8 AS placement, MAX(created_at) AS latest
       FROM claims`,
  );
  const r = rows[0];
  return `${r.n}:${r.ids}:${r.placement}:${r.latest ? new Date(r.latest).getTime() : 0}`;
}

/**
 * Cached corpus for read-only requests. A cheap fingerprint query detects changes
 * made outside this process (for example "npm run db:reset" while the server runs).
 */
export async function getCorpus() {
  const fp = await fingerprint(pool);
  if (cached && cached.fingerprint === fp && (!embeddings.enabled || cached.semantic || embeddings.coolingDown())) return cached;
  cached = await buildCorpus(pool);
  cached.fingerprint = fp;
  return cached;
}

function blend(local, a, b, semantic) {
  const cos = semantic && a && b ? cosineArrays(a, b) : null;
  return blendScore(local, cos, { weight: embeddings.weight, floor: embeddings.floor });
}

/** Similarity between two corpus items. */
export function pairScore(corpus, a, b) {
  const l = localSimilarity(a.vec, b.vec);
  const { score, semantic } = blend(l.local, a.embedding, b.embedding, corpus.semantic);
  return { score, lexical: l.lexical, character: l.character, semantic };
}

async function embedOne(corpus, texts) {
  if (!corpus.semantic) return texts.map(() => null);
  try {
    return await embeddings.embed(texts);
  } catch {
    return texts.map(() => null);
  }
}

/** Score free text against every claim in the corpus, best first. */
export async function rankText(corpus, text) {
  const vec = corpus.model.vectorize(text);
  const [emb] = await embedOne(corpus, [text]);
  return corpus.items
    .map((item) => {
      const l = localSimilarity(vec, item.vec);
      const { score, semantic } = blend(l.local, emb, item.embedding, Boolean(emb));
      return { item, score, lexical: l.lexical, character: l.character, semantic };
    })
    .sort((x, y) => y.score - x.score || x.item.publishedAt - y.item.publishedAt);
}

/** Similarity between two arbitrary texts, using the corpus for IDF weights. */
export async function compareTexts(corpus, a, b) {
  const va = corpus.model.vectorize(a);
  const vb = corpus.model.vectorize(b);
  const l = localSimilarity(va, vb);
  const [ea, eb] = await embedOne(corpus, [a, b]);
  const { score, semantic } = blend(l.local, ea, eb, Boolean(ea && eb));
  return { score, lexical: l.lexical, character: l.character, semantic };
}

export const thresholds = () => ({
  link: config.nlp.linkThreshold,
  related: config.nlp.relatedThreshold,
});
