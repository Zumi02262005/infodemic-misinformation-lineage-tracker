// Porter stemming algorithm (M.F. Porter, 1980), "An algorithm for suffix stripping".
// Reduces English words to a common stem so "vaccinated", "vaccination" and
// "vaccine" all compare as the same term.

const step2list = {
  ational: 'ate',
  tional: 'tion',
  enci: 'ence',
  anci: 'ance',
  izer: 'ize',
  bli: 'ble',
  alli: 'al',
  entli: 'ent',
  eli: 'e',
  ousli: 'ous',
  ization: 'ize',
  ation: 'ate',
  ator: 'ate',
  alism: 'al',
  iveness: 'ive',
  fulness: 'ful',
  ousness: 'ous',
  aliti: 'al',
  iviti: 'ive',
  biliti: 'ble',
  logi: 'log',
};

const step3list = {
  icate: 'ic',
  ative: '',
  alize: 'al',
  iciti: 'ic',
  ical: 'ic',
  ful: '',
  ness: '',
};

const c = '[^aeiou]'; // consonant
const v = '[aeiouy]'; // vowel
const C = c + '[^aeiouy]*'; // consonant sequence
const V = v + '[aeiou]*'; // vowel sequence

const mgr0 = new RegExp('^(' + C + ')?' + V + C); // m > 0
const meq1 = new RegExp('^(' + C + ')?' + V + C + '(' + V + ')?$'); // m = 1
const mgr1 = new RegExp('^(' + C + ')?' + V + C + V + C); // m > 1
const sV = new RegExp('^(' + C + ')?' + v); // vowel in stem
const cvc = new RegExp('^' + C + v + '[^aeiouwxy]$');
const doubleCons = /([^aeiouylsz])\1$/;

const cache = new Map();

export function stem(word) {
  if (word.length < 3) return word;
  const hit = cache.get(word);
  if (hit !== undefined) return hit;

  let w = word;
  const firstch = w[0];
  if (firstch === 'y') w = 'Y' + w.slice(1);

  // Step 1a
  if (/^(.+?)(ss|i)es$/.test(w)) w = w.replace(/^(.+?)(ss|i)es$/, '$1$2');
  else if (/^(.+?)([^s])s$/.test(w)) w = w.replace(/^(.+?)([^s])s$/, '$1$2');

  // Step 1b
  let m = /^(.+?)eed$/.exec(w);
  if (m) {
    if (mgr0.test(m[1])) w = w.slice(0, -1);
  } else if ((m = /^(.+?)(ed|ing)$/.exec(w))) {
    const st = m[1];
    if (sV.test(st)) {
      w = st;
      if (/(at|bl|iz)$/.test(w)) w += 'e';
      else if (doubleCons.test(w)) w = w.slice(0, -1);
      else if (cvc.test(w)) w += 'e';
    }
  }

  // Step 1c
  if ((m = /^(.+?)y$/.exec(w))) {
    if (sV.test(m[1])) w = m[1] + 'i';
  }

  // Step 2
  m = /^(.+?)(ational|tional|enci|anci|izer|bli|alli|entli|eli|ousli|ization|ation|ator|alism|iveness|fulness|ousness|aliti|iviti|biliti|logi)$/.exec(w);
  if (m && mgr0.test(m[1])) w = m[1] + step2list[m[2]];

  // Step 3
  m = /^(.+?)(icate|ative|alize|iciti|ical|ful|ness)$/.exec(w);
  if (m && mgr0.test(m[1])) w = m[1] + step3list[m[2]];

  // Step 4
  m = /^(.+?)(al|ance|ence|er|ic|able|ible|ant|ement|ment|ent|ou|ism|ate|iti|ous|ive|ize)$/.exec(w);
  if (m) {
    if (mgr1.test(m[1])) w = m[1];
  } else if ((m = /^(.+?)(s|t)(ion)$/.exec(w))) {
    const st = m[1] + m[2];
    if (mgr1.test(st)) w = st;
  }

  // Step 5
  if ((m = /^(.+?)e$/.exec(w))) {
    const st = m[1];
    if (mgr1.test(st) || (meq1.test(st) && !cvc.test(st))) w = st;
  }
  if (/ll$/.test(w) && mgr1.test(w)) w = w.slice(0, -1);

  if (firstch === 'y') w = 'y' + w.slice(1);

  if (cache.size > 50000) cache.clear();
  cache.set(word, w);
  return w;
}
