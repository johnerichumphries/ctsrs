import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const deck = JSON.parse(
  readFileSync(new URL('../data/citizenship_2025_newhaven.json', import.meta.url))
);

test('deck has all 128 questions', () => {
  assert.equal(deck.questions.length, 128, `expected 128 questions, got ${deck.questions.length}`);
});

test('every question has a non-empty preferredAnswers array', () => {
  for (const q of deck.questions) {
    assert.ok(Array.isArray(q.preferredAnswers), `Q${q.id}: preferredAnswers missing or not an array`);
    assert.ok(q.preferredAnswers.length > 0, `Q${q.id}: preferredAnswers is empty`);
  }
});

test('every preferred answer exactly matches an entry in answers', () => {
  for (const q of deck.questions) {
    for (const p of q.preferredAnswers) {
      assert.ok(q.answers.includes(p), `Q${q.id}: preferred ${JSON.stringify(p)} not found in answers`);
    }
  }
});

test('preferredAnswers length follows the count rule', () => {
  for (const q of deck.questions) {
    const expected = q.answerCount === 1 ? 1 : q.answerCount + 1;
    assert.equal(
      q.preferredAnswers.length,
      expected,
      `Q${q.id}: expected ${expected} preferred (answerCount ${q.answerCount}), got ${q.preferredAnswers.length}`
    );
  }
});

test('preferred answers are unique within a question', () => {
  for (const q of deck.questions) {
    assert.equal(
      new Set(q.preferredAnswers).size,
      q.preferredAnswers.length,
      `Q${q.id}: duplicate preferred answers`
    );
  }
});
