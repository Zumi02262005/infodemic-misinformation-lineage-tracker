import { config } from '../config.js';

// Optional semantic-embedding providers. When one is configured, its embedding
// similarity is blended with the built-in lexical engine. Any failure (no network,
// bad key, rate limit) falls back to the built-in engine and is reported at /api/nlp.

const DEFAULT_FLOOR = { openai: 0.2, huggingface: 0.1 };
const TIMEOUT_MS = 20000;

function validVectors(vectors, count) {
  if (!Array.isArray(vectors) || vectors.length !== count) return false;
  const dim = vectors[0]?.length;
  return vectors.every((v) => Array.isArray(v) && v.length === dim && dim > 0 && v.every((x) => typeof x === 'number' && Number.isFinite(x)));
}

function meanPool(tokens) {
  const dim = tokens[0].length;
  const out = new Array(dim).fill(0);
  for (const t of tokens) for (let i = 0; i < dim; i++) out[i] += t[i];
  return out.map((x) => x / tokens.length);
}

async function postJson(url, headers, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${new URL(url).host}: ${text.slice(0, 240)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON from ${new URL(url).host}`);
  }
}

function openaiProvider(cfg) {
  return {
    name: 'openai',
    model: cfg.model,
    batchSize: 96,
    async embedBatch(texts) {
      const json = await postJson(`${cfg.baseUrl}/embeddings`, { Authorization: `Bearer ${cfg.apiKey}` }, { model: cfg.model, input: texts });
      const data = Array.isArray(json?.data) ? [...json.data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0)) : [];
      return data.map((d) => d.embedding);
    },
  };
}

function huggingfaceProvider(cfg) {
  const url = cfg.url || `https://router.huggingface.co/hf-inference/models/${cfg.model}/pipeline/feature-extraction`;
  return {
    name: 'huggingface',
    model: cfg.model,
    batchSize: 32,
    async embedBatch(texts) {
      const headers = { 'x-wait-for-model': 'true' };
      if (cfg.token) headers.Authorization = `Bearer ${cfg.token}`;
      const json = await postJson(url, headers, { inputs: texts });
      if (!Array.isArray(json)) throw new Error(`Unexpected response from Hugging Face: ${JSON.stringify(json).slice(0, 200)}`);
      // Sentence-transformer models return one vector per input; others return
      // one vector per token, which is mean-pooled into a sentence vector.
      return json.map((item) => (Array.isArray(item?.[0]) ? meanPool(item) : item));
    },
  };
}

class EmbeddingService {
  constructor(nlp = config.nlp) {
    this.weight = Math.min(1, Math.max(0, nlp.semanticWeight));
    this.status = { lastError: null, lastErrorAt: null, lastSuccessAt: null };
    this.impl = null;
    this.disabledReason = null;
    if (nlp.requestedProvider !== nlp.provider) {
      this.disabledReason = `Unknown NLP_PROVIDER "${nlp.requestedProvider}". Use local, openai or huggingface.`;
    } else if (nlp.provider === 'openai') {
      if (nlp.openai.apiKey) this.impl = openaiProvider(nlp.openai);
      else this.disabledReason = 'NLP_PROVIDER is "openai" but OPENAI_API_KEY is not set.';
    } else if (nlp.provider === 'huggingface') {
      this.impl = huggingfaceProvider(nlp.huggingface);
    }
    const floorEnv = Number(nlp.semanticFloor);
    this.floor = nlp.semanticFloor !== undefined && nlp.semanticFloor !== '' && Number.isFinite(floorEnv)
      ? Math.min(0.9, Math.max(0, floorEnv))
      : DEFAULT_FLOOR[this.impl?.name] ?? 0.1;
    if (this.disabledReason) console.warn(`[nlp] ${this.disabledReason} Using the built-in engine only.`);
  }

  get enabled() {
    return Boolean(this.impl);
  }

  get model() {
    return this.impl ? `${this.impl.name}:${this.impl.model}` : null;
  }

  /** Seconds to wait before retrying after a failure, so a dead API doesn't slow every request. */
  coolingDown() {
    return this.status.lastErrorAt && Date.now() - this.status.lastErrorAt < 60000;
  }

  async embed(texts) {
    if (!this.impl) throw new Error('No embedding provider configured');
    const out = [];
    try {
      for (let i = 0; i < texts.length; i += this.impl.batchSize) {
        const batch = texts.slice(i, i + this.impl.batchSize);
        const vectors = await this.impl.embedBatch(batch);
        if (!validVectors(vectors, batch.length)) throw new Error('Embedding response had the wrong shape');
        out.push(...vectors);
      }
      this.status.lastSuccessAt = Date.now();
      this.status.lastError = null;
      this.status.lastErrorAt = null;
      return out;
    } catch (err) {
      const reason = err.name === 'TimeoutError' ? `Request timed out after ${TIMEOUT_MS / 1000}s` : err.message;
      if (this.status.lastError !== reason) console.warn(`[nlp] ${this.impl.name} embeddings failed: ${reason}. Falling back to the built-in engine.`);
      this.status.lastError = reason;
      this.status.lastErrorAt = Date.now();
      throw err;
    }
  }

  describe() {
    return {
      provider: this.impl ? this.impl.name : 'local',
      model: this.impl ? this.impl.model : null,
      semantic: Boolean(this.impl) && !this.coolingDown(),
      semanticWeight: this.impl ? this.weight : 0,
      semanticFloor: this.impl ? this.floor : null,
      warning: this.disabledReason,
      lastError: this.status.lastError,
      lastErrorAt: this.status.lastErrorAt ? new Date(this.status.lastErrorAt).toISOString() : null,
    };
  }
}

export const embeddings = new EmbeddingService();
