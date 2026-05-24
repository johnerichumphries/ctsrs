const DYNAMIC_IDS = [23, 29, 30, 38, 39, 57, 61, 62];

export function validateDeck(deck) {
  const qs = deck.questions;
  if (!Array.isArray(qs) || qs.length !== 128) {
    throw new Error(`Deck must have 128 questions, got ${qs?.length}`);
  }
  const ids = qs.map((q) => q.id).sort((a, b) => a - b);
  for (let i = 0; i < 128; i++) {
    if (ids[i] !== i + 1) throw new Error(`Ids must be contiguous 1..128 (missing ${i + 1})`);
  }
  const dyn = qs.filter((q) => q.dynamic).map((q) => q.id).sort((a, b) => a - b);
  if (dyn.join(',') !== DYNAMIC_IDS.join(',')) {
    throw new Error(`Expected dynamic ids ${DYNAMIC_IDS} got ${dyn}`);
  }
  const senior = qs.filter((q) => q.seniorExemption).length;
  if (senior !== 20) throw new Error(`Expected 20 seniorExemption, got ${senior}`);
  const cats = new Set(qs.map((q) => q.category));
  if (cats.size !== 7) throw new Error(`Expected 7 categories, got ${cats.size}`);
  for (const q of qs) {
    if (!Array.isArray(q.answers) || q.answers.length === 0) {
      throw new Error(`Q${q.id} has no answers`);
    }
    const pa = q.preferredAnswers;
    if (!Array.isArray(pa) || pa.length === 0) {
      throw new Error(`Q${q.id} missing preferredAnswers`);
    }
    const want = q.answerCount === 1 ? 1 : q.answerCount + 1;
    if (pa.length !== want) {
      throw new Error(`Q${q.id} preferredAnswers length ${pa.length}, expected ${want}`);
    }
    if (new Set(pa).size !== pa.length) throw new Error(`Q${q.id} duplicate preferredAnswers`);
    for (const a of pa) {
      if (!q.answers.includes(a)) {
        throw new Error(`Q${q.id} preferredAnswers "${a}" not in answers`);
      }
    }
  }
  return deck;
}

export function buildIndices(deck) {
  const byId = new Map();
  const byCategory = new Map();
  const allIds = [];
  for (const q of deck.questions) {
    byId.set(q.id, q);
    allIds.push(q.id);
    if (!byCategory.has(q.category)) byCategory.set(q.category, []);
    byCategory.get(q.category).push(q.id);
  }
  allIds.sort((a, b) => a - b);
  return { byId, byCategory, categories: [...byCategory.keys()], allIds };
}

export async function loadDeck(deckUrl, clustersUrl) {
  const [deckRes, clustersRes] = await Promise.all([fetch(deckUrl), fetch(clustersUrl)]);
  if (!deckRes.ok) throw new Error(`Failed to load deck: ${deckRes.status}`);
  if (!clustersRes.ok) throw new Error(`Failed to load clusters: ${clustersRes.status}`);
  const deck = validateDeck(await deckRes.json());
  const clusters = await clustersRes.json();
  return { deck, clusters, indices: buildIndices(deck) };
}
