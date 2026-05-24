import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const deck = JSON.parse(
  readFileSync(new URL('../data/citizenship_2025_newhaven.json', import.meta.url))
);
const clusters = JSON.parse(
  readFileSync(new URL('../tools/clusters.json', import.meta.url))
);

const byId = new Map(deck.questions.map((q) => [q.id, q]));
const validId = (id) => Number.isInteger(id) && id >= 1 && id <= 128;

function checkGroupIds(label, ids) {
  assert.ok(Array.isArray(ids) && ids.length >= 2, `${label}: needs at least 2 ids`);
  for (const id of ids) {
    assert.ok(validId(id), `${label}: id ${JSON.stringify(id)} is out of range 1..128`);
  }
  assert.equal(new Set(ids).size, ids.length, `${label}: duplicate ids`);
}

test('sameAnswer clusters share an identical preferred answer string in the deck', () => {
  for (const { answer, ids } of clusters.sameAnswer) {
    checkGroupIds(`sameAnswer "${answer}"`, ids);
    for (const id of ids) {
      const q = byId.get(id);
      assert.ok(
        q.preferredAnswers.includes(answer),
        `sameAnswer "${answer}": Q${id} preferredAnswers ${JSON.stringify(q.preferredAnswers)} does not include it`
      );
    }
  }
});

test('thematic and confusionPair groups reference only valid question ids', () => {
  for (const { topic, ids } of clusters.thematic) {
    checkGroupIds(`thematic "${topic}"`, ids);
  }
  for (const { note, ids } of clusters.confusionPairs) {
    checkGroupIds(`confusionPair "${note}"`, ids);
  }
});
