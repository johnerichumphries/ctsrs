import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initState, migrate, save, load, SCHEMA_VERSION, defaultSettings } from '../src/store.js';

const deck = JSON.parse(
  readFileSync(new URL('../data/citizenship_2025_newhaven.json', import.meta.url))
);

test('initState seeds all 128 cards with shuffled unique dueSlides', () => {
  const s = initState(deck);
  assert.equal(s.version, SCHEMA_VERSION);
  assert.equal(s.slidesSeen, 0);
  assert.equal(Object.keys(s.cards).length, 128);
  const dues = Object.values(s.cards).map((c) => c.dueSlide).sort((a, b) => a - b);
  assert.deepEqual(dues, Array.from({ length: 128 }, (_, i) => i)); // 0..127
  const c = s.cards['1'];
  assert.deepEqual(
    Object.keys(c).sort(),
    ['dueSlide', 'ef', 'interval', 'lapses', 'lastSeenSlide', 'reps', 'timesSeen']
  );
  assert.equal(s.activeSession, null);
  assert.deepEqual(s.testHistory, []);
});

test('migrate v2 -> v3 adds timesSeen, new settings, history/session, keeps data', () => {
  const v2 = {
    version: 2, slidesSeen: 42,
    cards: { '1': { ef: 2.4, interval: 30, reps: 3, dueSlide: 60, lapses: 1, lastSeenSlide: 30 } },
    settings: { maxGap: 400, showPreferredOnly: true },
  };
  const m = migrate(v2, deck);
  assert.equal(m.version, 3);
  assert.equal(m.slidesSeen, 42);
  assert.equal(m.cards['1'].timesSeen, 0);
  assert.equal(m.cards['1'].ef, 2.4);            // preserved
  assert.equal(m.settings.showPreferredOnly, true);
  assert.equal(m.settings.masteryThreshold, defaultSettings().masteryThreshold);
  assert.deepEqual(m.testHistory, []);
  assert.equal(m.activeSession, null);
});

test('save/load round-trips via an injected storage stub', () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const s = initState(deck);
  s.slidesSeen = 5;
  save(s, storage);
  const loaded = load(deck, storage);
  assert.equal(loaded.slidesSeen, 5);
  assert.equal(Object.keys(loaded.cards).length, 128);
});

test('load with empty storage initializes fresh state', () => {
  const mem = new Map();
  const storage = { getItem: () => null, setItem: (k, v) => mem.set(k, v) };
  const loaded = load(deck, storage);
  assert.equal(loaded.version, SCHEMA_VERSION);
  assert.equal(Object.keys(loaded.cards).length, 128);
});
