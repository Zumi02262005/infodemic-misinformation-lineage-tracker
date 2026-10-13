export class ApiError extends Error {
  constructor(status, message, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

const UNREACHABLE = 'Cannot reach the Infodemic API. Make sure the server is running (npm run dev in the project folder).';

async function request(method, path, body, { signal } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(0, UNREACHABLE);
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    // A non-JSON 5xx comes from the dev proxy when the API process is down.
    if (!data && res.status >= 500) throw new ApiError(0, UNREACHABLE);
    throw new ApiError(res.status, data?.message || `Request failed with status ${res.status}`, data);
  }
  return data;
}

const q = (params) => {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString();
  return s ? `?${s}` : '';
};

export const api = {
  health: (opts) => request('GET', '/health', undefined, opts),
  nlp: (opts) => request('GET', '/nlp', undefined, opts),
  examples: (opts) => request('GET', '/examples', undefined, opts),
  stats: (opts) => request('GET', '/stats', undefined, opts),
  narratives: (opts) => request('GET', '/narratives', undefined, opts),
  graph: (narrative = 'all', opts) => request('GET', `/graph${q({ narrative })}`, undefined, opts),
  claim: (id, opts) => request('GET', `/claims/${id}`, undefined, opts),
  showcase: (narrative, opts) => request('GET', `/showcase${q({ narrative })}`, undefined, opts),
  search: (text, opts) => request('GET', `/search${q({ q: text, limit: 8 })}`, undefined, opts),
  datasets: (opts) => request('GET', '/datasets', undefined, opts),
  compare: (a, b) => request('POST', '/similarity', { a, b }),
  ingest: (claim, { dryRun = false } = {}) => request('POST', `/claims${dryRun ? '?dryRun=1' : ''}`, claim),
  bulk: (payload) => request('POST', '/claims/bulk', payload),
  deleteClaim: (id) => request('DELETE', `/claims/${id}`),
  moveClaim: (id, narrativeId) => request('PATCH', `/claims/${id}`, { narrative_id: narrativeId }),
  updateNarrative: (id, patch) => request('PATCH', `/narratives/${id}`, patch),
  deleteNarrative: (id) => request('DELETE', `/narratives/${id}`),
  createDataset: (dataset) => request('POST', '/datasets', dataset),
  rebuild: () => request('POST', '/lineage/rebuild'),
  exportUrl: (id) => `/api/narratives/${id}/export`,
};
