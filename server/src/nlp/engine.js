import { extractFeatures } from './text.js';

// Built-in NLP similarity engine. Works offline with no API key.
//
//   lexical   = cosine similarity of TF-IDF vectors over canonical terms + bigrams
//   character = cosine similarity of TF-IDF vectors over character trigrams
//   local     = 0.7 * lexical + 0.3 * character
//
// IDF is learned from the claims already in the database, so terms that appear
// in every claim ("covid") count for less than distinctive ones ("gargle").

export const LOCAL_WEIGHTS = { lexical: 0.7, character: 0.3 };
const BIGRAM_WEIGHT = 0.7;

export class CorpusModel {
  constructor(texts = []) {
    this.N = 0;
    this.termDf = new Map();
    this.gramDf = new Map();
    for (const t of texts) this.addDocument(extractFeatures(t));
  }

  addDocument(features) {
    this.N += 1;
    for (const k of features.terms.keys()) this.termDf.set(k, (this.termDf.get(k) || 0) + 1);
    for (const k of features.grams.keys()) this.gramDf.set(k, (this.gramDf.get(k) || 0) + 1);
  }

  idf(df) {
    return Math.log((this.N + 1) / ((df || 0) + 1)) + 1;
  }

  /** Turn raw text (or precomputed features) into weighted, normalised vectors. */
  vectorize(textOrFeatures) {
    const f = typeof textOrFeatures === 'string' ? extractFeatures(textOrFeatures) : textOrFeatures;
    const terms = weigh(f.terms, (k) => this.idf(this.termDf.get(k)) * (k.includes('_') ? BIGRAM_WEIGHT : 1));
    const grams = weigh(f.grams, (k) => this.idf(this.gramDf.get(k)));
    return { terms, grams, tokenCount: f.tokenCount };
  }
}

function weigh(counts, idfOf) {
  const out = new Map();
  let norm = 0;
  for (const [k, tf] of counts) {
    const w = (1 + Math.log(tf)) * idfOf(k);
    out.set(k, w);
    norm += w * w;
  }
  norm = Math.sqrt(norm);
  if (norm > 0) for (const [k, w] of out) out.set(k, w / norm);
  return out;
}

export function cosineMaps(a, b) {
  if (!a.size || !b.size) return 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [k, w] of small) {
    const o = large.get(k);
    if (o !== undefined) dot += w * o;
  }
  return Math.min(1, Math.max(0, dot));
}

export function cosineArrays(a, b) {
  if (!a || !b || a.length !== b.length || !a.length) return null;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return null;
  return dot / Math.sqrt(na * nb);
}

/** Local (offline) similarity between two vectors from the same CorpusModel. */
export function localSimilarity(va, vb) {
  const lexical = cosineMaps(va.terms, vb.terms);
  const character = cosineMaps(va.grams, vb.grams);
  const local = LOCAL_WEIGHTS.lexical * lexical + LOCAL_WEIGHTS.character * character;
  return { lexical, character, local };
}

/**
 * Blend local similarity with an embedding cosine when a semantic provider is on.
 * Embedding cosines rarely go below a model-specific floor even for unrelated text,
 * so they are rescaled from [floor, 1] to [0, 1] before blending.
 */
export function blendScore(local, semanticCosine, { weight, floor }) {
  if (semanticCosine === null || semanticCosine === undefined || Number.isNaN(semanticCosine)) {
    return { score: local, semantic: null };
  }
  const semantic = Math.min(1, Math.max(0, (semanticCosine - floor) / (1 - floor)));
  return { score: weight * semantic + (1 - weight) * local, semantic };
}

export function round(n, digits = 4) {
  if (n === null || n === undefined) return null;
  const p = 10 ** digits;
  return Math.round(n * p) / p;
}
