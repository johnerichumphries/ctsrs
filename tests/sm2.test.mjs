import test from 'node:test';
import assert from 'node:assert/strict';
import { schedule, FIRST, SECOND, LAPSE_GAP, MAX_GAP, EF_INIT } from '../src/sm2.js';

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
