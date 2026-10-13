// Visual vocabulary. The interface itself stays monochrome; these "fluorophore"
// colours are reserved for data, the way stains mark specimens under a microscope.

export const MUTATIONS = {
  origin: { label: 'Origin', color: '#FFF1C2', description: 'Earliest version found in the data.' },
  paraphrase: { label: 'Paraphrase', color: '#56D8FF', description: 'Reworded without a clear change in substance.' },
  exaggeration: { label: 'Exaggeration', color: '#FF5A76', description: 'Stronger certainty, absolute language or inflated figures.' },
  distortion: { label: 'Altered figures', color: '#FF9A4A', description: 'Numbers or measurable facts changed or invented.' },
  attribution: { label: 'False authority', color: '#B98CFF', description: 'Credited to doctors, scientists or institutions.' },
  'context-shift': { label: 'Context shift', color: '#FFD84D', description: 'Moved to a new place, event or actor.' },
  'viral-hook': { label: 'Viral hook', color: '#FF6FD8', description: 'Adds pressure to share, forward or “wake up”.' },
  embellishment: { label: 'Embellishment', color: '#4DF5A8', description: 'Adds new detail or extra claims.' },
  truncation: { label: 'Simplification', color: '#6E95FF', description: 'Stripped down to a shorter, blunter version.' },
  verbatim: { label: 'Verbatim copy', color: '#8C9BC9', description: 'Repeated almost word for word.' },
};
export const MUTATION_ORDER = Object.keys(MUTATIONS);
export const mutationOf = (type) => MUTATIONS[type] || MUTATIONS.paraphrase;

export const NARRATIVE_COLORS = ['#56D8FF', '#FF5A76', '#4DF5A8', '#FFD84D', '#B98CFF', '#FF9A4A', '#FF6FD8', '#6E95FF', '#7CF0E0', '#F7A8FF', '#C8F06A', '#FFB4A2'];
export const narrativeColor = (id) => NARRATIVE_COLORS[(Math.max(1, Number(id) || 1) - 1) % NARRATIVE_COLORS.length];

export const DATASET_KINDS = {
  social: { label: 'Social media', color: '#56D8FF' },
  forum: { label: 'Forum', color: '#B98CFF' },
  messaging: { label: 'Messaging', color: '#4DF5A8' },
  news: { label: 'News & blogs', color: '#FFD84D' },
  video: { label: 'Video', color: '#FF5A76' },
  'fact-check': { label: 'Fact-check', color: '#FFF1C2' },
  other: { label: 'Other', color: '#8C9BC9' },
};
export const datasetKindOf = (kind) => DATASET_KINDS[kind] || DATASET_KINDS.other;

export const VERDICTS = {
  false: { label: 'False', color: '#FF5A76' },
  misleading: { label: 'Misleading', color: '#FF9A4A' },
  unproven: { label: 'Unproven', color: '#FFD84D' },
  unverified: { label: 'Unverified', color: '#8C9BC9' },
  true: { label: 'True', color: '#4DF5A8' },
};
export const verdictOf = (v) => VERDICTS[v] || VERDICTS.unverified;

// Generation ramp: warm near the origin, cooling as the claim drifts further away.
export const GENERATION_RAMP = ['#FFF1C2', '#FFD84D', '#FF9A4A', '#FF5A76', '#FF6FD8', '#B98CFF', '#6E95FF', '#56D8FF'];
export const generationColor = (g) => GENERATION_RAMP[Math.min(GENERATION_RAMP.length - 1, Math.max(0, g || 0))];

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgba(hex, alpha) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
function mix(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}
const DRIFT_STOPS = ['#56D8FF', '#B98CFF', '#FF5A76'];
/** Drift from origin (0 = same wording, 1 = nothing left in common): cool to hot. */
export function driftColor(d) {
  const t = Math.min(1, Math.max(0, d ?? 0));
  return t < 0.5 ? mix(DRIFT_STOPS[0], DRIFT_STOPS[1], t / 0.5) : mix(DRIFT_STOPS[1], DRIFT_STOPS[2], (t - 0.5) / 0.5);
}

export const COLOR_MODES = [
  { id: 'mutation', label: 'Mutation' },
  { id: 'narrative', label: 'Narrative' },
  { id: 'dataset', label: 'Source' },
  { id: 'generation', label: 'Generation' },
  { id: 'drift', label: 'Drift' },
];

export function nodeColor(node, mode) {
  switch (mode) {
    case 'narrative':
      return narrativeColor(node.narrative_id);
    case 'dataset':
      return datasetKindOf(node.dataset_kind).color;
    case 'generation':
      return generationColor(node.generation);
    case 'drift':
      return node.parent_id ? driftColor(node.drift) : MUTATIONS.origin.color;
    default:
      return mutationOf(node.mutation_type).color;
  }
}
