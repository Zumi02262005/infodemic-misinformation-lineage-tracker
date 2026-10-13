import { STOPWORDS, contentTokens, normalizeText } from './text.js';

// Explains HOW a claim changed from its parent. These are transparent heuristics,
// so every label in the UI can be traced back to the words that triggered it.

export const MUTATION_TYPES = {
  origin: { label: 'Origin', description: 'Earliest version found in the data.' },
  verbatim: { label: 'Verbatim copy', description: 'Repeated almost word for word.' },
  paraphrase: { label: 'Paraphrase', description: 'Reworded without a clear change in substance.' },
  exaggeration: { label: 'Exaggeration', description: 'Stronger certainty, absolute language or inflated figures.' },
  distortion: { label: 'Altered figures', description: 'Numbers or measurable facts were changed or invented.' },
  attribution: { label: 'False authority', description: 'Credits the claim to doctors, scientists or institutions.' },
  'context-shift': { label: 'Context shift', description: 'Moved to a new place, event or actor.' },
  'viral-hook': { label: 'Viral hook', description: 'Adds pressure to share, forward or “wake up”.' },
  embellishment: { label: 'Embellishment', description: 'Adds new detail or extra claims.' },
  truncation: { label: 'Simplification', description: 'Stripped down to a shorter, blunter version.' },
};

const TAG_PRIORITY = ['exaggeration', 'distortion', 'attribution', 'context-shift', 'viral-hook', 'embellishment', 'truncation'];

const INTENSIFIERS = [
  'every single', 'everyone', 'everybody', 'always', 'never', 'totally', 'completely', 'entirely', 'absolutely',
  'definitely', 'guaranteed', 'proven', 'proof', 'proves', 'prove', 'proved', 'confirmed', 'confirm', 'confirms',
  'undeniable', 'instantly', 'immediately', 'miracle', 'shocking', 'shocked', 'secret', 'secretly', 'hidden', 'hid',
  'hide', 'hiding', 'exposed', 'expose', 'admit', 'admits', 'admitted', 'deadly', 'lethal', 'banned', 'censored',
  'impossible', 'engineered', 'dwarf', 'dwarfs', 'stronger', 'exactly', 'far more', 'on purpose', 'wake up',
  'not a virus', 'must be', 'could never',
];
const HEDGES = [
  'may', 'might', 'could', 'can', 'possibly', 'perhaps', 'reportedly', 'allegedly', 'some', 'suggest', 'suggests',
  'seem', 'seems', 'appear', 'appears', 'likely', 'potentially', 'help', 'helps', 'developing',
];
const AUTHORITY = [
  'doctor', 'doctors', 'physician', 'physicians', 'nurse', 'nurses', 'scientist', 'scientists', 'expert', 'experts',
  'researcher', 'researchers', 'study', 'university', 'hospital', 'hospitals', 'professor', 'engineer', 'engineers',
  'geologist', 'geologists', 'insider', 'insiders', 'official', 'officials', 'ministry', 'nasa', 'cdc', 'fda',
  'military', 'leaked documents', 'documents', 'patent', 'stanford', 'harvard', 'pentagon', 'health ministry',
];
const HOOKS = [
  'share', 'forward', 'repost', 'retweet', 'spread the word', 'before it gets deleted', 'before they delete',
  'before it is deleted', 'tell everyone', 'wake up', 'look at', 'try putting', 'try it', 'compare the maps',
  'see for yourself', 'do your own research', 'coincidence',
];
const NOT_ENTITIES = new Set(['I', 'Earth', 'Moon', 'Sun', 'God', 'Internet', 'Claim', 'Breaking', 'Proof', 'Share', 'Wake']);

function phraseSet(text, list) {
  const norm = ' ' + normalizeText(text).replace(/[^a-z0-9%\s]/g, ' ').replace(/\s+/g, ' ') + ' ';
  const found = new Set();
  for (const p of list) if (norm.includes(' ' + p + ' ')) found.add(p);
  return found;
}

function added(parentSet, childSet) {
  return [...childSet].filter((x) => !parentSet.has(x));
}

const UNIT_ALIASES = {
  percent: '%', '%': '%', times: 'x', x: 'x', minute: 'minutes', minutes: 'minutes', hour: 'hours', hours: 'hours',
  day: 'days', days: 'days', week: 'weeks', weeks: 'weeks', month: 'months', months: 'months', year: 'years',
  years: 'years', degree: 'degrees', degrees: 'degrees', ghz: 'GHz', second: 'seconds', seconds: 'seconds',
};

/** Numbers that carry meaning (not "5G", not a year like 1969). */
export function extractNumbers(text) {
  const out = [];
  const re = /(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(\s*)([a-zA-Z%]+)?/g;
  let m;
  while ((m = re.exec(String(text)))) {
    const before = m.index > 0 ? text[m.index - 1] : ' ';
    if (/[a-zA-Z]/.test(before)) continue; // part of a word like "covid19"
    if (before === '-' && m.index > 1 && /[a-zA-Z]/.test(text[m.index - 2])) continue; // "COVID-19"
    const rawUnit = (m[3] || '').toLowerCase();
    const unit = UNIT_ALIASES[rawUnit];
    if (rawUnit && !m[2] && !unit) continue; // attached letters like "5G"
    const value = Number(m[1].replace(/,/g, ''));
    if (!unit && Number.isInteger(value) && value >= 1800 && value <= 2100) continue; // a year
    const u = unit || '';
    const label = u === '%' ? `${m[1]}%` : u === 'GHz' ? `${m[1]}GHz` : u === 'x' ? `${m[1]}×` : u ? `${m[1]} ${u}` : m[1];
    out.push({ value, unit: u, label });
  }
  return out;
}

function entities(text) {
  const out = new Set();
  const re = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g;
  let m;
  while ((m = re.exec(text))) {
    const phrase = m[0];
    const before = text.slice(0, m.index).trimEnd();
    const sentenceStart = before === '' || /[.!?:]$/.test(before);
    const words = phrase.split(/\s+/);
    if (sentenceStart) {
      // A capital at the start of a sentence is not evidence of a name,
      // unless it begins a multi-word name ("Super Typhoon Haiyan").
      if (words.length < 2) continue;
      while (words.length && (NOT_ENTITIES.has(words[0]) || STOPWORDS.has(words[0].toLowerCase()))) words.shift();
      if (!words.length) continue;
    }
    const name = words.filter((w) => !NOT_ENTITIES.has(w)).join(' ');
    if (name) out.add(name);
  }
  return out;
}

/** Word-level diff (LCS) between two texts, for highlighting what changed. */
export function wordDiff(a, b) {
  const A = String(a).match(/\S+/g) || [];
  const B = String(b).match(/\S+/g) || [];
  const key = (w) => w.toLowerCase().replace(/[^\p{L}\p{N}%]/gu, '');
  const kA = A.map(key);
  const kB = B.map(key);
  const same = (x, y) => kA[x] !== '' && kA[x] === kB[y];
  const n = A.length;
  const m = B.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = same(i, j) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const seq = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (same(i, j)) {
      seq.push(['eq', B[j]]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      seq.push(['del', A[i++]]);
    } else {
      seq.push(['add', B[j++]]);
    }
  }
  while (i < n) seq.push(['del', A[i++]]);
  while (j < m) seq.push(['add', B[j++]]);

  // Group each changed region as "deleted words, then inserted words".
  const ops = [];
  let dels = [];
  let adds = [];
  const flush = () => {
    if (dels.length) ops.push({ op: 'del', text: dels.join(' ') });
    if (adds.length) ops.push({ op: 'add', text: adds.join(' ') });
    dels = [];
    adds = [];
  };
  for (const [op, word] of seq) {
    if (op === 'del') dels.push(word);
    else if (op === 'add') adds.push(word);
    else {
      flush();
      const last = ops[ops.length - 1];
      if (last && last.op === 'eq') last.text += ' ' + word;
      else ops.push({ op: 'eq', text: word });
    }
  }
  flush();
  return ops;
}

const quote = (list, max = 3) => list.slice(0, max).map((x) => `“${x}”`).join(', ');

/** Recover the original spelling of a matched (normalised) phrase from the text. */
function original(text, phrase) {
  const pattern = phrase
    .split(' ')
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[^\\p{L}\\p{N}%]+');
  const m = new RegExp(`(?<![\\p{L}\\p{N}])${pattern}(?![\\p{L}\\p{N}])`, 'iu').exec(text);
  return m ? m[0] : phrase;
}

/**
 * Analyse `child` as a mutation of `parent`.
 * @returns {{type: string, tags: string[], signals: object, summary: string}}
 */
export function analyzeMutation(parent, child, similarity = null) {
  const diff = wordDiff(parent, child);
  const changedWords = diff.filter((d) => d.op !== 'eq').reduce((n, d) => n + d.text.split(/\s+/).length, 0);

  const pTok = contentTokens(parent);
  const cTok = contentTokens(child);
  const pCanon = new Set(pTok.canon);
  const cCanon = new Set(cTok.canon);
  const addedTerms = [...new Set(cTok.raw.filter((_, i) => !pCanon.has(cTok.canon[i])))];
  const removedTerms = [...new Set(pTok.raw.filter((_, i) => !cCanon.has(pTok.canon[i])))];
  const lengthRatio = pTok.raw.length ? cTok.raw.length / pTok.raw.length : 1;

  const intensifiers = added(phraseSet(parent, INTENSIFIERS), phraseSet(child, INTENSIFIERS));
  const hedgesRemoved = added(phraseSet(child, HEDGES), phraseSet(parent, HEDGES));
  const authority = added(phraseSet(parent, AUTHORITY), phraseSet(child, AUTHORITY)).filter(
    (a, _, arr) => !arr.some((b) => b !== a && b.includes(a)),
  );
  const hooks = added(phraseSet(parent, HOOKS), phraseSet(child, HOOKS));
  const parentLower = parent.toLowerCase();
  const newEntities = [...entities(child)].filter((e) => !parentLower.includes(e.toLowerCase()));

  const pNums = extractNumbers(parent);
  const cNums = extractNumbers(child);
  const numKey = (n) => `${n.value}|${n.unit}`;
  const pKeys = new Set(pNums.map(numKey));
  const cKeys = new Set(cNums.map(numKey));
  const numbersAdded = cNums.filter((n) => !pKeys.has(numKey(n)));
  const numbersRemoved = pNums.filter((n) => !cKeys.has(numKey(n)));
  const inflated = numbersAdded.some(
    (n) =>
      (n.unit === '%' && n.value >= 90) ||
      (n.unit === 'x' && n.value >= 10) ||
      numbersRemoved.some((r) => r.unit === n.unit && r.value > 0 && n.value >= r.value * 1.5 && n.unit !== 'minutes'),
  );

  const tags = new Set();
  if (intensifiers.length || inflated) tags.add('exaggeration');
  if (numbersAdded.length) tags.add('distortion');
  if (authority.length) tags.add('attribution');
  if (newEntities.length) tags.add('context-shift');
  if (hooks.length) tags.add('viral-hook');
  if (lengthRatio >= 1.5 && addedTerms.length >= 4) tags.add('embellishment');
  if (lengthRatio <= 0.6 && pTok.raw.length >= 5) tags.add('truncation');
  // Dropping hedges ("can help", "may") is a weaker signal: use it only when nothing else explains the change.
  if (!tags.size && hedgesRemoved.length && changedWords > 0) tags.add('exaggeration');

  // The primary type is the strongest signal; ties go to the earlier entry in TAG_PRIORITY.
  const hedgeOnly = !intensifiers.length && !inflated && tags.has('exaggeration');
  const strength = {
    exaggeration: intensifiers.length * 0.7 + (inflated ? 1.2 : 0) + (hedgeOnly ? 0.5 : 0),
    distortion: numbersAdded.length + (numbersRemoved.length ? 0.2 : 0),
    attribution: authority.length * 1.3,
    'context-shift': newEntities.length * 1.15,
    'viral-hook': hooks.length * 0.9,
    embellishment: 0.9,
    truncation: 0.95,
  };
  const ranked = TAG_PRIORITY.filter((t) => tags.has(t)).sort((a, b) => strength[b] - strength[a]);
  let type;
  if ((similarity === null || similarity >= 0.85) && changedWords <= 2) type = 'verbatim';
  else type = ranked[0] || 'paraphrase';
  const orderedTags = ranked;

  const inChild = (list) => list.map((p) => original(child, p));
  const inParent = (list) => list.map((p) => original(parent, p));
  const parts = [];
  if (type === 'verbatim') parts.push('Repeats the earlier version almost word for word');
  if (tags.has('exaggeration')) {
    if (intensifiers.length) parts.push(`Escalates certainty with ${quote(inChild(intensifiers))}`);
    else if (hedgesRemoved.length) parts.push(`Drops hedging such as ${quote(inParent(hedgesRemoved), 2)}`);
    else parts.push('Inflates the numbers');
  }
  if (tags.has('distortion')) {
    const a = numbersAdded.map((n) => n.label);
    const r = numbersRemoved.map((n) => n.label);
    parts.push(r.length ? `Changes figures from ${quote(r, 2)} to ${quote(a, 2)}` : `Adds specific figures ${quote(a, 2)}`);
  }
  if (tags.has('attribution')) parts.push(`Credits the claim to ${quote(inChild(authority), 2)}`);
  if (tags.has('context-shift')) parts.push(`Moves the story to ${quote(newEntities, 2)}`);
  if (tags.has('viral-hook')) parts.push(`Adds pressure to spread it with ${quote(inChild(hooks), 2)}`);
  if (tags.has('embellishment')) parts.push('Adds new detail and supporting claims');
  if (tags.has('truncation')) parts.push('Strips the claim down to a blunter version');
  if (!parts.length) parts.push('Rewords the earlier version without a clear change in substance');

  const summary = parts.slice(0, 3).join('. ');

  return {
    type,
    tags: orderedTags,
    summary: summary + '.',
    signals: {
      intensifiers: inChild(intensifiers),
      hedgesRemoved: inParent(hedgesRemoved),
      authority: inChild(authority),
      hooks: inChild(hooks),
      entities: newEntities,
      numbersAdded: numbersAdded.map((n) => n.label),
      numbersRemoved: numbersRemoved.map((n) => n.label),
      addedTerms: addedTerms.slice(0, 12),
      removedTerms: removedTerms.slice(0, 12),
      lengthRatio: Math.round(lengthRatio * 100) / 100,
      changedWords,
    },
  };
}
