import { shuffle } from './queue.js';

export const STORAGE_KEY = 'citizenship_srs_v1';
export const SCHEMA_VERSION = 3;

export function defaultSettings() {
  return { maxGap: 400, showPreferredOnly: false, masteryThreshold: 75, practicePerCategory: 3 };
}

export function initState(deck, rng = Math.random) {
  const ids = deck.questions.map((q) => q.id);
  const dues = shuffle(ids.map((_, i) => i), rng); // 0..127 shuffled
  const cards = {};
  ids.forEach((id, i) => {
    cards[String(id)] = {
      ef: 2.5, interval: 0, reps: 0, dueSlide: dues[i],
      lapses: 0, lastSeenSlide: -1, timesSeen: 0,
    };
  });
  return {
    version: SCHEMA_VERSION,
    slidesSeen: 0,
    cards,
    settings: defaultSettings(),
    testHistory: [],
    activeSession: null,
  };
}

export function migrate(state, deck) {
  if (!state || typeof state !== 'object') return initState(deck);
  if (state.version === SCHEMA_VERSION) return state;
  if (state.version === 2) {
    const cards = {};
    for (const [id, c] of Object.entries(state.cards)) {
      cards[id] = { timesSeen: 0, lastSeenSlide: -1, ...c };
    }
    return {
      version: SCHEMA_VERSION,
      slidesSeen: state.slidesSeen ?? 0,
      cards,
      settings: { ...defaultSettings(), ...(state.settings ?? {}) },
      testHistory: [],
      activeSession: null,
    };
  }
  // Unknown/older shape: never crash; start fresh (no app version shipped before v3).
  return initState(deck);
}

export function load(deck, storage = globalThis.localStorage) {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) {
    const s = initState(deck);
    save(s, storage);
    return s;
  }
  let parsed;
  try { parsed = JSON.parse(raw); } catch { parsed = null; }
  const migrated = migrate(parsed, deck);
  if (migrated !== parsed) save(migrated, storage);
  return migrated;
}

export function save(state, storage = globalThis.localStorage) {
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function exportJSON(state) {
  return JSON.stringify(state, null, 2);
}

export function importJSON(text, deck) {
  return migrate(JSON.parse(text), deck);
}
