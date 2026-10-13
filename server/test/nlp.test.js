import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stem } from '../src/nlp/porter.js';
import { contentTokens, extractFeatures, sharedTerms } from '../src/nlp/text.js';
import { CorpusModel, blendScore, cosineArrays, localSimilarity } from '../src/nlp/engine.js';
import { analyzeMutation, extractNumbers, wordDiff } from '../src/nlp/mutation.js';
import { claims } from '../src/db/seed-data.js';

test('Porter stemmer matches reference outputs', () => {
  const cases = {
    caresses: 'caress', ponies: 'poni', agreed: 'agre', motoring: 'motor', hopping: 'hop', happy: 'happi',
    relational: 'relat', conditional: 'condit', vietnamization: 'vietnam', hopefulness: 'hope', electrical: 'electr',
    adjustment: 'adjust', generalizations: 'gener', oscillators: 'oscil', vaccinated: 'vaccin', vaccination: 'vaccin',
  };
  for (const [word, expected] of Object.entries(cases)) assert.equal(stem(word), expected, word);
});

test('lexicon collapses misinformation synonyms', () => {
  const a = contentTokens('The jab contains a chip').canon;
  const b = contentTokens('Vaccines contain microchips').canon;
  assert.ok(a.includes('vaccine') && b.includes('vaccine'));
  assert.ok(a.includes('microchip') && b.includes('microchip'));
  assert.deepEqual(contentTokens('COVID-19 and the coronavirus').canon, ['covid', 'covid']);
});

test('features include bigrams and character trigrams', () => {
  const f = extractFeatures('Gargle salt water');
  assert.ok(f.terms.has('salt_water'));
  assert.ok(f.grams.has('_ga'));
});

test('similar variants score higher than unrelated claims', () => {
  const model = new CorpusModel(claims.map((c) => c.text));
  const v = (t) => model.vectorize(t);
  const variant = localSimilarity(
    v('Drinking hot water every 15 minutes kills the coronavirus.'),
    v('Stanford doctors confirm: drinking hot water every 15 minutes kills 100% of the coronavirus.'),
  ).local;
  const unrelated = localSimilarity(v('Drinking hot water every 15 minutes kills the coronavirus.'), v('The flag is waving in the moon landing video.')).local;
  assert.ok(variant > 0.4, `variant ${variant}`);
  assert.ok(unrelated < 0.1, `unrelated ${unrelated}`);
  const self = localSimilarity(v('Volcanoes emit more CO2 than humans.'), v('Volcanoes emit more CO2 than humans.')).local;
  assert.ok(Math.abs(self - 1) < 1e-9);
});

test('blendScore rescales the embedding cosine and falls back without one', () => {
  assert.deepEqual(blendScore(0.3, null, { weight: 0.6, floor: 0.2 }), { score: 0.3, semantic: null });
  const { score, semantic } = blendScore(0.5, 0.6, { weight: 0.5, floor: 0.2 });
  assert.ok(Math.abs(semantic - 0.5) < 1e-9);
  assert.ok(Math.abs(score - 0.5) < 1e-9);
  assert.equal(cosineArrays([1, 0], [0, 1]), 0);
  assert.equal(cosineArrays([1, 2], [1]), null);
});

test('number extraction ignores 5G, COVID-19 and years', () => {
  const labels = extractNumbers('Since 1900, 5G and COVID-19 spread 100% faster every 15 minutes at 60GHz, 10,000 times').map((n) => n.label);
  assert.deepEqual(labels, ['100%', '15 minutes', '60GHz', '10,000×']);
});

test('wordDiff groups deletions before insertions', () => {
  const ops = wordDiff('salt water can help soothe a sore throat', 'salt water kills the virus in your throat');
  assert.deepEqual(ops.map((o) => o.op), ['eq', 'del', 'add', 'eq']);
  assert.equal(ops[0].text, 'salt water');
  assert.equal(ops[3].text, 'throat');
});

test('mutation analysis explains what changed', () => {
  const m = analyzeMutation(
    'Drinking hot water every 15 minutes washes the virus into your stomach.',
    'Stanford doctors confirm: drinking hot water every 15 minutes kills 100% of the coronavirus. Share with everyone!',
    0.4,
  );
  assert.ok(['exaggeration', 'attribution'].includes(m.type));
  assert.ok(m.tags.includes('attribution') && m.tags.includes('viral-hook') && m.tags.includes('distortion'));
  assert.ok(m.signals.authority.includes('Stanford'));
  assert.ok(m.signals.numbersAdded.includes('100%'));
  assert.match(m.summary, /Stanford/);

  const place = analyzeMutation('5G towers were switched on during the lockdown.', '5G towers were switched on in Lagos during the lockdown.', 0.8);
  assert.equal(place.type, 'context-shift');
  assert.deepEqual(place.signals.entities, ['Lagos']);

  const copy = analyzeMutation('Lemons cure cancer.', 'Lemons cure cancer!', 0.95);
  assert.equal(copy.type, 'verbatim');
});

test('sharedTerms reports overlapping words', () => {
  assert.deepEqual(sharedTerms('The vaccine has a chip', 'Microchips are in every jab'), ['vaccine', 'chip']);
});
