import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateDeck, buildIndices } from '../src/deck.js';

const deck = JSON.parse(
  readFileSync(new URL('../data/citizenship_2025_newhaven.json', import.meta.url))
);

test('validateDeck passes on the real deck and returns it', () => {
  assert.equal(validateDeck(deck), deck);
});

test('validateDeck throws when a count is wrong', () => {
  const broken = structuredClone(deck);
  broken.questions.pop(); // 127 questions
  assert.throws(() => validateDeck(broken), /128/);
});

test('validateDeck throws on a preferredAnswers mismatch', () => {
  const broken = structuredClone(deck);
  broken.questions[0].preferredAnswers = ['not a real answer'];
  assert.throws(() => validateDeck(broken), /preferredAnswers/);
});

test('buildIndices groups all 7 categories and 128 ids', () => {
  const idx = buildIndices(deck);
  assert.equal(idx.allIds.length, 128);
  assert.equal(idx.categories.length, 7);
  let sum = 0;
  for (const cat of idx.categories) sum += idx.byCategory.get(cat).length;
  assert.equal(sum, 128);
  assert.equal(idx.byId.get(38).question.includes('President'), true);
});
