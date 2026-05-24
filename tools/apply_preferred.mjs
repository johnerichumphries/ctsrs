import { readFileSync, writeFileSync } from 'node:fs';

const deckPath = new URL('../data/citizenship_2025_newhaven.json', import.meta.url);
const mapPath = new URL('./preferred_answers.json', import.meta.url);

const deck = JSON.parse(readFileSync(deckPath));
const map = JSON.parse(readFileSync(mapPath));

deck.questions = deck.questions.map((q) => {
  const preferred = map[String(q.id)];
  if (!preferred) throw new Error(`No preferred answers mapped for Q${q.id}`);

  for (const p of preferred) {
    if (!q.answers.includes(p)) {
      throw new Error(`Q${q.id}: preferred ${JSON.stringify(p)} is not an exact match in answers`);
    }
  }
  if (new Set(preferred).size !== preferred.length) {
    throw new Error(`Q${q.id}: duplicate entries in preferred_answers.json`);
  }
  const expected = q.answerCount === 1 ? 1 : q.answerCount + 1;
  if (preferred.length !== expected) {
    throw new Error(`Q${q.id}: expected ${expected} preferred answers, got ${preferred.length}`);
  }

  const out = {};
  for (const [k, v] of Object.entries(q)) {
    if (k === 'preferredAnswers') continue;
    out[k] = v;
    if (k === 'answers') out.preferredAnswers = preferred;
  }
  return out;
});

writeFileSync(deckPath, JSON.stringify(deck, null, 2) + '\n');
console.log(`Applied preferredAnswers to ${deck.questions.length} questions.`);
