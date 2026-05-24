import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextStreak, HAPPY, SAD } from '../src/streaks.js';

const S0 = { correctStreak: 0, wrongStreak: 0 };

// Fold a sequence of grade qualities through nextStreak, collecting fired hippos.
function run(qs, start = S0) {
  let s = { ...start };
  const fires = [];
  for (const q of qs) {
    const r = nextStreak(s, q);
    s = { correctStreak: r.correctStreak, wrongStreak: r.wrongStreak };
    if (r.fired) fires.push(r.fired);
  }
  return { state: s, fires };
}

test('threshold constants', () => {
  assert.deepEqual(HAPPY, [5, 10, 15, 25]);
  assert.deepEqual(SAD, [3, 6, 9, 12, 20]);
});

test('Good (q=4) increments correct, zeroes wrong, no fire below threshold', () => {
  const r = nextStreak({ correctStreak: 2, wrongStreak: 1 }, 4);
  assert.equal(r.correctStreak, 3);
  assert.equal(r.wrongStreak, 0);
  assert.equal(r.fired, null);
});

test('happy fires at exactly 5/10/15/25 on the incrementing step', () => {
  const { fires } = run(Array(25).fill(4));
  assert.deepEqual(fires, [
    { kind: 'happy', n: 5 }, { kind: 'happy', n: 10 },
    { kind: 'happy', n: 15 }, { kind: 'happy', n: 25 },
  ]);
});

test('no happy fire past the top threshold', () => {
  const { fires } = run(Array(30).fill(4)); // 25 then 26..30
  assert.equal(fires.filter((f) => f.kind === 'happy').length, 4);
});

test('Wrong (q=0) increments wrong, zeroes correct; sad fires at 3/6/9/12/20', () => {
  const { fires } = run(Array(20).fill(0));
  assert.deepEqual(fires, [
    { kind: 'sad', n: 3 }, { kind: 'sad', n: 6 }, { kind: 'sad', n: 9 },
    { kind: 'sad', n: 12 }, { kind: 'sad', n: 20 },
  ]);
});

test('correct resets wrong streak and vice versa', () => {
  const a = nextStreak({ correctStreak: 0, wrongStreak: 2 }, 4);
  assert.equal(a.wrongStreak, 0);
  assert.equal(a.correctStreak, 1);
  const b = nextStreak({ correctStreak: 4, wrongStreak: 0 }, 0);
  assert.equal(b.correctStreak, 0);
  assert.equal(b.wrongStreak, 1);
});

test('Hard (q=3) is neutral: unchanged correct, never fires, ends a wrong run', () => {
  // sitting exactly on a happy threshold must NOT re-fire
  const r = nextStreak({ correctStreak: 5, wrongStreak: 0 }, 3);
  assert.equal(r.correctStreak, 5);
  assert.equal(r.fired, null);
  // a pass ends a wrong run
  const w = nextStreak({ correctStreak: 0, wrongStreak: 2 }, 3);
  assert.equal(w.wrongStreak, 0);
  assert.equal(w.correctStreak, 0);
});

test('a Hard mid-run does not break a happy streak (4 Good -> Hard -> Good fires 5)', () => {
  const { fires } = run([4, 4, 4, 4, 3, 4]);
  assert.deepEqual(fires, [{ kind: 'happy', n: 5 }]);
});

test('nextStreak does not mutate its input', () => {
  const input = { correctStreak: 4, wrongStreak: 0 };
  nextStreak(input, 4);
  assert.deepEqual(input, { correctStreak: 4, wrongStreak: 0 });
});
