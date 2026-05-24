import { schedule } from './sm2.js';

export function jitter(interval, rng = Math.random) {
  return Math.max(1, Math.round(interval * (0.85 + rng() * 0.30)));
}

// Returns a NEW state with card[cardId] rescheduled and the global clock advanced.
export function applyGrade(state, cardId, q, rng = Math.random) {
  const key = String(cardId);
  const card = state.cards[key];
  const shownAt = state.slidesSeen;
  const sched = schedule(card, q, state.settings.maxGap);
  const newCard = {
    ...card,
    ...sched,
    dueSlide: shownAt + jitter(sched.interval, rng),
    lastSeenSlide: shownAt,
    timesSeen: card.timesSeen + 1,
  };
  return {
    ...state,
    slidesSeen: shownAt + 1,
    cards: { ...state.cards, [key]: newCard },
  };
}
