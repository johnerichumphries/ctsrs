import { loadDeck } from './deck.js';
import { load, save } from './store.js';
import { nextReviewCardId } from './queue.js';
import { applyGrade } from './grading.js';
import { renderQuestion, renderAnswers, renderReviewButtons, renderStats } from './ui.js';

const view = document.getElementById('view');
const { deck, indices } = await loadDeck(
  './data/citizenship_2025_newhaven.json',
  './tools/clusters.json'
);
let state = load(deck);
let revealed = false;

function renderReview() {
  const id = nextReviewCardId(state);
  const q = indices.byId.get(id);
  const card = state.cards[String(id)];
  view.innerHTML = `
    ${renderStats(state)}
    ${renderQuestion(q)}
    ${revealed ? renderAnswers(q, state.settings.showPreferredOnly) : ''}
    <div class="actions">
      ${revealed
        ? `<div class="grades">${renderReviewButtons(card, state.settings.maxGap)}</div>`
        : `<button id="show">Show answer</button>`}
    </div>`;
  view.querySelector('#show')?.addEventListener('click', () => { revealed = true; renderReview(); });
  view.querySelectorAll('.grade').forEach((btn) =>
    btn.addEventListener('click', () => grade(Number(btn.dataset.q))));
}

function grade(q) {
  const id = nextReviewCardId(state);
  state = applyGrade(state, id, q);
  save(state);
  revealed = false;
  renderReview();
}

document.addEventListener('keydown', (e) => {
  if (!revealed && (e.key === ' ' || e.key === 'Enter')) {
    revealed = true; renderReview(); e.preventDefault();
  } else if (revealed && ['1', '2', '3', '4'].includes(e.key)) {
    grade([0, 3, 4, 5][Number(e.key) - 1]);
  }
});

renderReview();
