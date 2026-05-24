import test from 'node:test';
import assert from 'node:assert/strict';
import { schedule, FIRST, SECOND, LAPSE_GAP, MAX_GAP, EF_INIT, HARD_FACTOR, EASY_FACTOR } from '../src/sm2.js';

const fresh = () => ({ ef: EF_INIT, interval: 0, reps: 0, lapses: 0 });

test('Good progression: 5 -> 12 -> 30 with ef 2.5', () => {
  let s = schedule(fresh(), 4);
  assert.equal(s.interval, FIRST);          // 5
  assert.equal(s.reps, 1);
  s = schedule(s, 4);
  assert.equal(s.interval, SECOND);         // 12
  assert.equal(s.reps, 2);
  s = schedule(s, 4);
  assert.equal(s.interval, 30);             // round(12 * 2.5)
  assert.equal(s.reps, 3);
});

test('interval capped at MAX_GAP', () => {
  let s = { ef: 2.5, interval: 300, reps: 5, lapses: 0 };
  s = schedule(s, 4);                        // round(300*2.5)=750 -> 400
  assert.equal(s.interval, MAX_GAP);
});

test('ef: q=4 unchanged, q=5 +0.10, q=3 -0.14', () => {
  assert.ok(Math.abs(schedule(fresh(), 4).ef - 2.5) < 1e-9);
  assert.ok(Math.abs(schedule(fresh(), 5).ef - 2.6) < 1e-9);
  assert.ok(Math.abs(schedule(fresh(), 3).ef - 2.36) < 1e-9);
});

test('ef floored at 1.3 under repeated Hard', () => {
  let s = fresh();
  for (let i = 0; i < 20; i++) s = schedule(s, 3);
  assert.ok(s.ef >= 1.3 - 1e-9 && s.ef <= 1.3 + 1e-9);
});

test('lapse: reps->0, interval->LAPSE_GAP, lapses+1, ef unchanged', () => {
  const before = { ef: 2.2, interval: 75, reps: 4, lapses: 1 };
  const s = schedule(before, 0);
  assert.equal(s.reps, 0);
  assert.equal(s.interval, LAPSE_GAP);       // 3
  assert.equal(s.lapses, 2);
  assert.equal(s.ef, 2.2);
});

test('purity: output keys are exactly ef, interval, reps, lapses', () => {
  const s = schedule(fresh(), 4);
  assert.deepEqual(Object.keys(s).sort(), ['ef', 'interval', 'lapses', 'reps']);
});

test('Hard/Easy interval modifiers spread the first review (Anki-style)', () => {
  assert.equal(schedule(fresh(), 3).interval, 4);     // Hard: round(FIRST * 0.8)
  assert.equal(schedule(fresh(), 4).interval, FIRST); // Good: 5 (unchanged)
  assert.equal(schedule(fresh(), 5).interval, 7);     // Easy: round(FIRST * 1.4)
});

test('Hard/Easy modifiers apply at the second review too', () => {
  const reps1 = { ef: 2.5, interval: FIRST, reps: 1, lapses: 0 };
  assert.equal(schedule(reps1, 3).interval, 10);      // Hard: round(SECOND * 0.8)
  assert.equal(schedule(reps1, 4).interval, SECOND);  // Good: 12 (unchanged)
  assert.equal(schedule(reps1, 5).interval, 17);      // Easy: round(SECOND * 1.4)
});

test('from the 3rd review the modifier compounds on round(interval * ef)', () => {
  const reps2 = { ef: 2.5, interval: 12, reps: 2, lapses: 0 };
  assert.equal(schedule(reps2, 4).interval, 30);      // Good: round(12 * 2.5)
  assert.equal(schedule(reps2, 3).interval, 24);      // Hard: round(30 * 0.8)
  assert.equal(schedule(reps2, 5).interval, 42);      // Easy: round(30 * 1.4)
});

test('Easy interval is still capped at MAX_GAP', () => {
  const big = { ef: 2.5, interval: 300, reps: 5, lapses: 0 };
  assert.equal(schedule(big, 5).interval, MAX_GAP);   // round(300*2.5)=750, *1.4 -> capped 400
});

test('Hard interval is floored at 1 (never rounds to 0)', () => {
  const zero = { ef: 2.5, interval: 0, reps: 5, lapses: 0 }; // base round(0*ef)=0
  assert.equal(schedule(zero, 3).interval, 1);
});

test('modifier constants: HARD_FACTOR 0.8, EASY_FACTOR 1.4', () => {
  assert.equal(HARD_FACTOR, 0.8);
  assert.equal(EASY_FACTOR, 1.4);
});
