import test from 'node:test';
import assert from 'node:assert/strict';
import { shuffle, nextReviewCardId } from '../src/queue.js';

test('shuffle returns a permutation without mutating input', () => {
  const input = [0, 1, 2, 3, 4];
  const out = shuffle(input, mulberry32(42));
  assert.notEqual(out, input);
  assert.deepEqual([...input], [0, 1, 2, 3, 4]);
  assert.deepEqual([...out].sort((a, b) => a - b), [0, 1, 2, 3, 4]);
});

test('nextReviewCardId picks smallest dueSlide, tie-break numeric id', () => {
  const state = { cards: {
    '5': { dueSlide: 10 },
    '2': { dueSlide: 4 },
    '9': { dueSlide: 4 },
  } };
  assert.equal(nextReviewCardId(state), 2); // dueSlide 4 tie -> id 2 < 9
});

// deterministic PRNG for tests
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
