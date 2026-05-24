export function shuffle(arr, rng = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function nextReviewCardId(state) {
  let bestId = null;
  let bestDue = Infinity;
  for (const [id, card] of Object.entries(state.cards)) {
    const nid = Number(id);
    if (card.dueSlide < bestDue || (card.dueSlide === bestDue && nid < bestId)) {
      bestDue = card.dueSlide;
      bestId = nid;
    }
  }
  return bestId;
}
