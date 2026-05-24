import { shuffle } from './queue.js';

export function buildDoubleCheck(state, rng = Math.random) {
  const ids = Object.entries(state.cards)
    .filter(([, c]) => c.interval >= state.settings.masteryThreshold)
    .map(([id]) => Number(id));
  return shuffle(ids, rng);
}

export function buildWrongMost(state) {
  return Object.entries(state.cards)
    .filter(([, c]) => c.lapses >= 1 && c.timesSeen >= 3)
    .map(([id, c]) => ({ id: Number(id), rate: c.lapses / c.timesSeen, lapses: c.lapses }))
    .sort((a, b) => b.rate - a.rate || b.lapses - a.lapses || a.id - b.id)
    .map((o) => o.id);
}

export function buildPractice(state, indices, rng = Math.random) {
  const n = state.settings.practicePerCategory;
  const picked = [];
  for (const cat of indices.categories) {
    picked.push(...shuffle(indices.byCategory.get(cat), rng).slice(0, n));
  }
  return shuffle(picked, rng);
}

export function buildFull(indices, rng = Math.random) {
  return shuffle(indices.allIds, rng);
}

export function buildClusters(clusters) {
  const segs = [];
  for (const c of clusters.sameAnswer) segs.push({ kind: 'sameAnswer', label: `Same answer: ${c.answer}`, ids: c.ids });
  for (const c of clusters.thematic) segs.push({ kind: 'thematic', label: `Theme: ${c.topic}`, ids: c.ids });
  for (const c of clusters.confusionPairs) segs.push({ kind: 'confusion', label: "Don't confuse", note: c.note, ids: c.ids });
  return segs;
}

export function clusterOrder(segments) {
  return segments.flatMap((s) => s.ids);
}

export function clusterHeaderAt(segments, index) {
  let acc = 0;
  for (const s of segments) {
    if (index < acc + s.ids.length) return s;
    acc += s.ids.length;
  }
  return null;
}

export function score(order, marks, indices) {
  let correct = 0;
  const byCategory = {};
  for (const id of order) {
    const cat = indices.byId.get(id).category;
    byCategory[cat] ??= { correct: 0, total: 0 };
    byCategory[cat].total += 1;
    if (marks[String(id)]) { correct += 1; byCategory[cat].correct += 1; }
  }
  return { score: correct, total: order.length, byCategory };
}
