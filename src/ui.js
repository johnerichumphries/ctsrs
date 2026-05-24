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

export const MODES = [
  { id: 'review', label: 'Review', desc: 'Adaptive spaced repetition (default)' },
  { id: 'double', label: 'Double-check', desc: 'Re-confirm cards you know cold' },
  { id: 'clusters', label: 'Clusters', desc: 'Drill questions that share an answer/theme' },
  { id: 'wrong', label: 'Wrong-most', desc: 'Focus on your most-missed cards' },
  { id: 'practice', label: 'Practice test', desc: '~3 per category, scored' },
  { id: 'full', label: 'Full test', desc: 'All 128 questions, scored' },
];

export function renderHome(state, counts) {
  const resume = state.activeSession
    ? `<button id="resume" class="resume">Resume ${state.activeSession.mode} test (${state.activeSession.cursor}/${state.activeSession.order.length})</button>`
    : '';
  const cards = MODES.map((m) => {
    const badge = counts[m.id] != null ? `<small>${counts[m.id]}</small>` : '';
    return `<button class="mode" data-mode="${m.id}"><b>${m.label}</b> ${badge}<span>${m.desc}</span></button>`;
  }).join('');
  const hist = (state.testHistory || []).slice(-5).reverse().map((h) =>
    `<li>${h.mode}: ${h.score}/${h.total} (slide ${h.atSlide})</li>`).join('');
  return `${resume}<div class="modes">${cards}</div>
    ${hist ? `<h3>Recent tests</h3><ul class="history">${hist}</ul>` : ''}`;
}

const TWO_BUTTONS = [
  { key: '1', label: 'Wrong', q: 0 },
  { key: '2', label: 'Right', q: 4 },
];
export function renderTwoButtons() {
  return `<div class="grades two">${TWO_BUTTONS.map((b) =>
    `<button class="grade" data-q="${b.q}">${b.label}</button>`).join('')}</div>`;
}

export function renderClusterHeader(seg) {
  if (!seg) return '';
  const note = seg.note ? `<p class="muted">${esc(seg.note)}</p>` : '';
  return `<div class="cluster-head">${esc(seg.label)}</div>${note}`;
}

export function renderSummary(result) {
  const pass = result.score / result.total >= 0.6;
  const rows = Object.entries(result.byCategory)
    .map(([cat, v]) => `<li>${esc(cat)}: ${v.correct}/${v.total}</li>`).join('');
  return `
    <h2>${pass ? 'Pass ✅' : 'Keep studying'}</h2>
    <p class="score">${result.score} / ${result.total} (${Math.round(100 * result.score / result.total)}%)</p>
    <ul class="bycat">${rows}</ul>
    <div class="actions"><button id="home-btn">← Home</button></div>`;
}

export function renderNav(active) {
  const tab = (id, label) => `<button class="navtab ${active === id ? 'on' : ''}" data-nav="${id}">${label}</button>`;
  return `<nav class="bottomnav">${tab('home', 'Home')}${tab('browse', 'Browse')}${tab('settings', 'Settings')}</nav>`;
}

export function renderBrowse(deck, state, filter) {
  const opts = ['all', ...new Set(deck.questions.map((q) => q.category))]
    .map((c) => `<option ${c === filter.cat ? 'selected' : ''}>${esc(c)}</option>`).join('');
  const rows = deck.questions
    .filter((q) => filter.cat === 'all' || q.category === filter.cat)
    .filter((q) => !filter.text || (q.question + ' ' + q.answers.join(' ')).toLowerCase().includes(filter.text.toLowerCase()))
    .map((q) => {
      const c = state.cards[String(q.id)];
      return `<details><summary>Q${q.id}. ${esc(q.question)}</summary>
        <ul class="answers">${q.answers.map((a) =>
          `<li>${q.preferredAnswers.includes(a) ? '<strong>' + esc(a) + '</strong>' : esc(a)}</li>`).join('')}</ul>
        <p class="muted">ef ${c.ef.toFixed(2)} · interval ${c.interval} · due ${c.dueSlide} · lapses ${c.lapses} · seen ${c.timesSeen}</p>
      </details>`;
    }).join('');
  return `<div class="browse-controls">
      <select id="cat">${opts}</select>
      <input id="search" placeholder="Search…" value="${esc(filter.text || '')}" />
    </div>${rows}`;
}
