import { test } from 'node:test';
import assert from 'node:assert/strict';
import { celebrationMarkup } from '../src/ui.js';

test('celebrationMarkup builds a happy hippo img', () => {
  const html = celebrationMarkup({ kind: 'happy', n: 5 });
  assert.match(html, /class="hippo"/);
  assert.match(html, /src="\.\/images\/hippohappy_5\.png"/);
  assert.match(html, /alt="Happy hippo/);
  assert.match(html, /5 in a row!/);
});

test('celebrationMarkup builds a sad hippo img', () => {
  const html = celebrationMarkup({ kind: 'sad', n: 12 });
  assert.match(html, /src="\.\/images\/hipposad_12\.png"/);
  assert.match(html, /alt="Sad hippo/);
  assert.match(html, /12 wrong in a row/);
});

test('celebrationMarkup returns empty string for null', () => {
  assert.equal(celebrationMarkup(null), '');
});
