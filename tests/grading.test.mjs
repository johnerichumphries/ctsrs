import test from 'node:test';
import assert from 'node:assert/strict';
import { jitter, applyGrade } from '../src/grading.js';

const baseState = () => ({
  version: 3,
  slidesSeen: 100,
  cards: {
    '7': { ef: 2.5, interval: 0, reps: 0, dueSlide: 50, lapses: 0, lastSeenSlide: -1, timesSeen: 2 },
  },
  settings: { maxGap: 400 },
});

test('jitter with rng=0.5 returns interval (factor 1.0), min 1', () => {
  assert.equal(jitter(12, () => 0.5), 12); // 0.85 + 0.5*0.30 = 1.0
  assert.equal(jitter(0, () => 0.5), 1);   // floor at 1
});

test('Right (q=4) advances card and bumps counters', () => {
  const s = applyGrade(baseState(), 7, 4, () => 0.5);
  assert.equal(s.slidesSeen, 101);
  const c = s.cards['7'];
  assert.equal(c.interval, 5);             // FIRST
  assert.equal(c.reps, 1);
  assert.equal(c.timesSeen, 3);
  assert.equal(c.lastSeenSlide, 100);      // shown at slide 100
  assert.equal(c.dueSlide, 105);           // 100 + jitter(5)=5
});

test('Wrong (q=0) lapses card', () => {
  const start = baseState();
  start.cards['7'].interval = 75; start.cards['7'].reps = 4;
  const s = applyGrade(start, 7, 0, () => 0.5);
  const c = s.cards['7'];
  assert.equal(c.interval, 3);             // LAPSE_GAP
  assert.equal(c.reps, 0);
  assert.equal(c.lapses, 1);
  assert.equal(c.dueSlide, 103);           // 100 + jitter(3)=3
});

test('does not mutate the input state', () => {
  const start = baseState();
  applyGrade(start, 7, 4, () => 0.5);
  assert.equal(start.slidesSeen, 100);
  assert.equal(start.cards['7'].timesSeen, 2);
});
