import { schedule } from './sm2.js';
// Renders the answer block for a question. `showPreferredOnly` hides the rest.
export function renderAnswers(q, showPreferredOnly = false) {
  const preferred = q.preferredAnswers;
  const others = q.answers.filter((a) => !preferred.includes(a));
  const pref = preferred.map((a) => `<li class="pref"><strong>${esc(a)}</strong></li>`).join('');
  let html = `<ul class="answers">${pref}</ul>`;
  if (!showPreferredOnly && others.length) {
    html += `<p class="muted">Other acceptable answers</p>`;
    html += `<ul class="answers other">${others.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>`;
  }
  return html;
}

export function renderQuestion(q) {
  const need = q.answerCount > 1 ? `<span class="hint">Name ${q.answerCount}</span>` : '';
  const badge = q.dynamic
    ? `<span class="badge" title="Verify before interview">verify before interview</span>`
    : '';
  return `
    <div class="chip">${esc(q.category)} ${badge}</div>
    <h2 class="question">${esc(q.question)} ${need}</h2>`;
}

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const REVIEW_BUTTONS = [
  { key: '1', label: 'Again', q: 0 },
  { key: '2', label: 'Hard', q: 3 },
  { key: '3', label: 'Good', q: 4 },
  { key: '4', label: 'Easy', q: 5 },
];

// preview gap excludes jitter so it's stable (PLAN §3.3)
export function renderReviewButtons(card, maxGap) {
  return REVIEW_BUTTONS.map((b) => {
    const gap = schedule(card, b.q, maxGap).interval;
    return `<button class="grade" data-q="${b.q}">${b.label}<small>≈ ${gap} slides</small></button>`;
  }).join('');
}

export function renderStats(state) {
  const cards = Object.values(state.cards);
  const mastered = cards.filter((c) => c.interval >= state.settings.masteryThreshold).length;
  const weak = cards.filter((c) => c.lapses > 0 && c.interval < 12).length;
  return `<header class="stats">Slides: ${state.slidesSeen} · Mastered: ${mastered}/128 · Weak: ${weak}</header>`;
}
