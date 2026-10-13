import { stem } from './porter.js';

// Function words that carry little meaning for matching claims. Negations
// (no, not, never) are deliberately kept: "is not a virus" is a different claim.
export const STOPWORDS = new Set(
  `a about above after again against all almost also am among an and another any anyone anything are aren't claim claims claimed
  around as at be because been before being below between both but by can can't cannot could couldn't did
  didn't do does doesn't doing don't down during each either else even ever every few for from further get
  gets getting got had hadn't has hasn't have haven't having he he'd he'll he's her here here's hers herself
  him himself his how how's i i'd i'll i'm i've if in into is isn't it it's its itself just let's like may
  me might more most must mustn't my myself nor now of off on once one only or other ought our ours
  ourselves out over own per really said same say says shall shan't she she'd she'll she's should
  shouldn't since so some such than that that's the their theirs them themselves then there there's these
  they they'd they'll they're they've thing things this those though through thus to too under until up
  upon us very via was wasn't way we we'd we'll we're we've well were weren't what what's when when's
  where where's whether which while who who's whom whose why why's will with within without won't would
  wouldn't yet you you'd you'll you're you've your yours yourself yourselves`
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.replace(/'/g, '')),
);

// Domain lexicon: surface forms that misinformation variants swap freely
// ("jab" for "vaccine", "mast" for "tower"). Each group collapses to one concept
// token so paraphrases still overlap. Words not listed fall back to Porter stems.
const LEXICON_GROUPS = {
  covid: ['covid', 'covid19', 'coronavirus', 'coronaviruses', 'corona', 'sarscov2', 'virus', 'viruses'],
  vaccine: ['vaccine', 'vaccines', 'vaccinated', 'vaccination', 'vaccinations', 'vax', 'vaxx', 'vaxxed', 'jab', 'jabs', 'jabbed', 'booster', 'boosters', 'inoculation', 'inoculations'],
  microchip: ['microchip', 'microchips', 'chip', 'chips', 'chipped', 'nanochip', 'nanochips'],
  cure: ['cure', 'cures', 'cured', 'curing', 'heal', 'heals', 'healed', 'healing', 'remedy', 'remedies', 'reverse', 'reverses'],
  kill: ['kill', 'kills', 'killed', 'killing', 'destroy', 'destroys', 'destroyed', 'eliminate', 'eliminates', 'eliminated', 'neutralize', 'neutralizes'],
  cancer: ['cancer', 'cancers', 'cancerous', 'tumor', 'tumors', 'tumour', 'tumours'],
  doctor: ['doctor', 'doctors', 'physician', 'physicians', 'nurse', 'nurses'],
  scientist: ['scientist', 'scientists', 'researcher', 'researchers', 'expert', 'experts', 'geologist', 'geologists'],
  co2: ['co2', 'carbon', 'dioxide'],
  moon: ['moon', 'lunar'],
  fake: ['fake', 'faked', 'faking', 'hoax', 'hoaxes', 'staged', 'fabricated'],
  storm: ['typhoon', 'typhoons', 'hurricane', 'hurricanes', 'cyclone', 'cyclones', 'storm', 'storms'],
  quake: ['earthquake', 'earthquakes', 'quake', 'quakes', 'seismic'],
  track: ['track', 'tracks', 'tracked', 'tracking', 'tracker', 'surveil', 'surveillance', 'monitor', 'monitors', 'monitored'],
  hot: ['hot', 'warm', 'heated', 'boiling'],
  drink: ['drink', 'drinks', 'drinking', 'drank', 'sip', 'sips', 'sipping'],
  radiation: ['radiation', 'radiations', 'emf'],
  tower: ['tower', 'towers', 'mast', 'masts', 'antenna', 'antennas'],
  government: ['government', 'governments', 'authorities', 'officials'],
  volcano: ['volcano', 'volcanoes', 'volcanos', 'volcanic', 'eruption', 'eruptions', 'erupted', 'erupting'],
  lemon: ['lemon', 'lemons', 'citrus'],
  chemo: ['chemo', 'chemotherapy'],
  photo: ['photo', 'photos', 'photograph', 'photographs', 'picture', 'pictures', 'image', 'images'],
  immune: ['immune', 'immunity'],
  magnet: ['magnet', 'magnets', 'magnetic', 'magnetised', 'magnetized'],
  leaf: ['leaf', 'leaves'],
};

const LEXICON = new Map();
for (const [concept, words] of Object.entries(LEXICON_GROUPS)) {
  for (const w of words) LEXICON.set(w, concept);
}

export function normalizeText(text) {
  return String(text ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’‘`´]/g, '')
    .replace(/\bcovid[\s-]?19\b/g, 'covid')
    .replace(/\bsars[\s-]?cov[\s-]?2\b/g, 'sarscov2');
}

/** Raw lowercase word tokens, punctuation removed. */
export function wordTokens(text) {
  return normalizeText(text).match(/[a-z0-9]+/g) || [];
}

/** Canonical form of one token: lexicon concept, else Porter stem. */
export function canonical(token) {
  return LEXICON.get(token) ?? stem(token);
}

/**
 * Content tokens used for matching: stopwords and single characters removed,
 * then canonicalised. Returns both the raw and canonical sequences (same order).
 */
export function contentTokens(text) {
  const raw = [];
  const canon = [];
  for (const t of wordTokens(text)) {
    if (t.length < 2 || STOPWORDS.has(t)) continue;
    raw.push(t);
    canon.push(canonical(t));
  }
  return { raw, canon };
}

/**
 * Feature bags for one text:
 *  - terms: canonical unigrams plus adjacent bigrams ("salt water")
 *  - grams: character trigrams of content words, which catch spelling variants
 */
export function extractFeatures(text) {
  const { raw, canon } = contentTokens(text);
  const terms = new Map();
  const add = (map, key, n = 1) => map.set(key, (map.get(key) || 0) + n);
  for (let i = 0; i < canon.length; i++) {
    add(terms, canon[i]);
    if (i > 0 && canon[i - 1] !== canon[i]) add(terms, canon[i - 1] + '_' + canon[i]);
  }
  const grams = new Map();
  for (const w of raw) {
    const padded = `_${w}_`;
    for (let i = 0; i + 3 <= padded.length; i++) add(grams, padded.slice(i, i + 3));
  }
  return { terms, grams, tokenCount: raw.length };
}

/** Human-readable shared key terms between two texts (for explanations). */
export function sharedTerms(a, b, limit = 8) {
  const A = contentTokens(a);
  const B = contentTokens(b);
  const bSet = new Set(B.canon);
  const seen = new Set();
  const out = [];
  A.canon.forEach((c, i) => {
    if (bSet.has(c) && !seen.has(c)) {
      seen.add(c);
      out.push(A.raw[i]);
    }
  });
  return out.slice(0, limit);
}
