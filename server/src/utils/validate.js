import { badRequest } from './http.js';

export const DATASET_KINDS = ['social', 'forum', 'messaging', 'news', 'video', 'fact-check', 'other'];
export const VERDICTS = ['false', 'misleading', 'unproven', 'unverified', 'true'];

const pick = (obj, ...keys) => {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && String(obj[k]).trim() !== '') return obj[k];
  }
  return undefined;
};

const cleanString = (v, max) => {
  if (v === undefined || v === null) return null;
  const s = String(v).replace(/\s+/g, ' ').trim();
  if (!s) return null;
  return s.slice(0, max);
};

export function parseDate(value, field = 'published_at') {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const raw = String(value).trim();
  // A bare date (2020-03-08) is read as midday UTC so it stays on the same calendar day everywhere.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T12:00:00Z`) : new Date(raw);
  if (Number.isNaN(d.getTime())) throw badRequest(`"${field}" is not a valid date: ${raw}`);
  const year = d.getUTCFullYear();
  if (year < 1900 || year > 2100) throw badRequest(`"${field}" must be between 1900 and 2100`);
  return d;
}

export function parseUrl(value) {
  const s = cleanString(value, 2000);
  if (!s) return null;
  let u;
  try {
    u = new URL(s);
  } catch {
    throw badRequest(`"source_url" is not a valid URL: ${s}`);
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw badRequest('"source_url" must start with http:// or https://');
  return u.toString();
}

export function parseReach(value) {
  if (value === undefined || value === null || String(value).trim() === '') return 0;
  const n = Number(String(value).replace(/[,_\s]/g, ''));
  if (!Number.isFinite(n) || n < 0) throw badRequest('"reach" must be a number of zero or more');
  return Math.min(Math.round(n), 2000000000);
}

/** Validate and normalise one claim submitted through the API or a bulk import row. */
export function validateClaimInput(body) {
  if (!body || typeof body !== 'object') throw badRequest('Send the claim as a JSON object');
  const text = cleanString(pick(body, 'text', 'claim', 'content'), 2000);
  if (!text || text.length < 8) throw badRequest('"text" is required and must be at least 8 characters');

  const published = parseDate(pick(body, 'published_at', 'date', 'published', 'timestamp')) || new Date();

  let dataset = pick(body, 'dataset_id', 'dataset', 'source', 'platform');
  if (dataset !== undefined) {
    dataset = typeof dataset === 'number' || /^\d+$/.test(String(dataset)) ? Number(dataset) : cleanString(dataset, 120);
  }
  const kindRaw = cleanString(pick(body, 'dataset_kind', 'kind'), 30);
  const datasetKind = kindRaw && DATASET_KINDS.includes(kindRaw.toLowerCase()) ? kindRaw.toLowerCase() : 'other';

  let narrativeId = pick(body, 'narrative_id');
  if (narrativeId !== undefined) {
    narrativeId = Number(narrativeId);
    if (!Number.isInteger(narrativeId) || narrativeId <= 0) throw badRequest('"narrative_id" must be a positive integer');
  }

  return {
    text,
    published_at: published,
    dataset: dataset ?? null,
    dataset_kind: datasetKind,
    author: cleanString(pick(body, 'author', 'account', 'handle', 'user'), 200),
    region: cleanString(pick(body, 'region', 'country'), 60)?.toUpperCase() ?? null,
    language: cleanString(pick(body, 'language', 'lang'), 12)?.toLowerCase() ?? 'en',
    reach: parseReach(pick(body, 'reach', 'shares', 'engagement', 'views')),
    source_url: parseUrl(pick(body, 'source_url', 'url', 'link')),
    narrative_id: narrativeId ?? null,
    force_new: body.force_new === true || body.force_new === 'true',
  };
}

export function validateNarrativePatch(body) {
  if (!body || typeof body !== 'object') throw badRequest('Send the changes as a JSON object');
  const out = {};
  if (body.title !== undefined) {
    const t = cleanString(body.title, 200);
    if (!t || t.length < 3) throw badRequest('"title" must be at least 3 characters');
    out.title = t;
  }
  if (body.summary !== undefined) out.summary = cleanString(body.summary, 1000);
  if (body.category !== undefined) out.category = cleanString(body.category, 80);
  if (body.fact_check !== undefined) out.fact_check = cleanString(body.fact_check, 1000);
  if (body.verdict !== undefined) {
    const v = String(body.verdict).toLowerCase();
    if (!VERDICTS.includes(v)) throw badRequest(`"verdict" must be one of: ${VERDICTS.join(', ')}`);
    out.verdict = v;
  }
  if (!Object.keys(out).length) throw badRequest('Nothing to update');
  return out;
}

export function validateDatasetInput(body) {
  if (!body || typeof body !== 'object') throw badRequest('Send the dataset as a JSON object');
  const name = cleanString(body.name, 120);
  if (!name || name.length < 2) throw badRequest('"name" is required');
  const kind = cleanString(body.kind, 30)?.toLowerCase() || 'other';
  if (!DATASET_KINDS.includes(kind)) throw badRequest(`"kind" must be one of: ${DATASET_KINDS.join(', ')}`);
  let url = null;
  if (body.url) {
    try {
      url = parseUrl(body.url);
    } catch {
      throw badRequest('"url" must be a valid http(s) URL');
    }
  }
  return { name, kind, description: cleanString(body.description, 500), url };
}

export function slugify(name) {
  return (
    String(name)
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'dataset'
  );
}
