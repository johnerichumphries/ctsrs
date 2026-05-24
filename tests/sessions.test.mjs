import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildIndices } from '../src/deck.js';
import {
  buildDoubleCheck, buildWrongMost, buildPractice, buildFull,
  buildClusters, clusterOrder, clusterHeaderAt, score, modeInformsSchedule,
} from '../src/sessions.js';

const deck = JSON.parse(
  readFileSync(new URL('../data/citizenship_2025_newhaven.json', import.meta.url))
);
const clusters = JSON.parse(
  readFileSync(new URL('../tools/clusters.json', import.meta.url))
);
const indices = buildIndices(deck);

function stateWith(overrides = {}, settings = {}) {
  const cards = {};
  for (const id of indices.allIds) {
    cards[String(id)] = { ef: 2.5, interval: 0, reps: 0, dueSlide: 0, lapses: 0, lastSeenSlide: -1, timesSeen: 0 };
  }
  for (const [id, patch] of Object.entries(overrides)) Object.assign(cards[id], patch);
  return { cards, settings: { masteryThreshold: 75, practicePerCategory: 3, ...settings } };
}

test('buildDoubleCheck returns only cards at/above masteryThreshold', () => {
  const s = stateWith({ '1': { interval: 80 }, '2': { interval: 75 }, '3': { interval: 74 } });
  const ids = buildDoubleCheck(s).sort((a, b) => a - b);
  assert.deepEqual(ids, [1, 2]);
});

test('buildWrongMost: lapses>=1 & timesSeen>=3, ranked by lapse rate', () => {
  const s = stateWith({
    '10': { lapses: 3, timesSeen: 4 }, // rate .75
    '11': { lapses: 3, timesSeen: 40 }, // rate .075
    '12': { lapses: 1, timesSeen: 2 }, // excluded (timesSeen<3)
    '13': { lapses: 0, timesSeen: 9 }, // excluded (no lapse)
  });
  assert.deepEqual(buildWrongMost(s), [10, 11]);
});

test('buildPractice picks exactly N per category', () => {
  const s = stateWith({}, { practicePerCategory: 3 });
  const ids = buildPractice(s, indices, () => 0.5);
  assert.equal(ids.length, 7 * 3);
  const cats = {};
  for (const id of ids) {
    const cat = indices.byId.get(id).category;
    cats[cat] = (cats[cat] || 0) + 1;
  }
  for (const cat of indices.categories) assert.equal(cats[cat], 3);
  assert.equal(new Set(ids).size, ids.length); // no dupes
});

test('buildFull returns all 128 once', () => {
  const ids = buildFull(indices, () => 0.5);
  assert.deepEqual([...ids].sort((a, b) => a - b), indices.allIds);
});

test('buildClusters mirrors clusters.json order; helpers work', () => {
  const segs = buildClusters(clusters);
  assert.equal(segs.length,
    clusters.sameAnswer.length + clusters.thematic.length + clusters.confusionPairs.length);
  assert.equal(segs[0].kind, 'sameAnswer');
  const order = clusterOrder(segs);
  assert.equal(order.length, segs.reduce((n, s) => n + s.ids.length, 0));
  assert.equal(clusterHeaderAt(segs, 0).kind, 'sameAnswer');
  assert.equal(clusterHeaderAt(segs, order.length - 1).kind, 'confusion');
});

test('score totals and per-category breakdown', () => {
  const order = [1, 2, 16]; // 1,2 = Principles; 16 = System of Government
  const marks = { '1': true, '2': false, '16': true };
  const r = score(order, marks, indices);
  assert.equal(r.score, 2);
  assert.equal(r.total, 3);
  assert.equal(r.byCategory['Principles of American Government'].correct, 1);
  assert.equal(r.byCategory['Principles of American Government'].total, 2);
  assert.equal(r.byCategory['System of Government'].correct, 1);
});

test('modeInformsSchedule: only Clusters is exempt from the schedule', () => {
  assert.equal(modeInformsSchedule('clusters'), false);
  for (const m of ['review', 'double', 'wrong', 'practice', 'full']) {
    assert.equal(modeInformsSchedule(m), true);
  }
});
