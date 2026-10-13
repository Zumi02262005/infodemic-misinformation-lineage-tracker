import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from '../src/utils/csv.js';
import { slugify, validateClaimInput } from '../src/utils/validate.js';
import { titleFromText } from '../src/services/lineage.js';

test('parseCsv handles quotes, escaped quotes, commas, newlines and CRLF', () => {
  const rows = parseCsv('﻿Text,Published At\r\n"Hello, ""world""",2020-01-01\r\n"multi\nline",\r\n\r\n');
  assert.deepEqual(rows, [
    { text: 'Hello, "world"', published_at: '2020-01-01' },
    { text: 'multi\nline', published_at: '' },
  ]);
  assert.throws(() => parseCsv('text\n"unclosed'), /unclosed/);
  assert.deepEqual(parseCsv(''), []);
});

test('validateClaimInput normalises fields and aliases', () => {
  const v = validateClaimInput({ claim: '  A claim   with spaces  ', date: '2020-03-08', shares: '1,200', url: 'https://example.org/a', country: 'ph', source: '3' });
  assert.equal(v.text, 'A claim with spaces');
  assert.equal(v.published_at.toISOString(), '2020-03-08T12:00:00.000Z');
  assert.equal(v.reach, 1200);
  assert.equal(v.region, 'PH');
  assert.equal(v.dataset, 3);
  assert.equal(v.source_url, 'https://example.org/a');
  assert.throws(() => validateClaimInput({ text: 'short' }), /at least 8/);
  assert.throws(() => validateClaimInput({ text: 'long enough text', source_url: 'ftp://x' }), /http/);
  assert.throws(() => validateClaimInput({ text: 'long enough text', published_at: '1800-01-01' }), /between/);
});

test('slugify and titleFromText', () => {
  assert.equal(slugify('Telegram Public Channels!'), 'telegram-public-channels');
  assert.equal(slugify('Ñandú'), 'nandu');
  assert.equal(titleFromText('Papaya leaves cure dengue. Share now!'), 'Papaya leaves cure dengue');
  const long = titleFromText('A '.repeat(60) + 'end');
  assert.ok(long.length <= 81 && long.endsWith('…'));
});
