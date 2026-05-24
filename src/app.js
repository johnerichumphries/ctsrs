import { loadDeck } from './deck.js';
import { renderQuestion, renderAnswers } from './ui.js';

const view = document.getElementById('view');
const { deck, indices } = await loadDeck(
  './data/citizenship_2025_newhaven.json',
  './tools/clusters.json'
);

let i = 0;
let revealed = false;

function render() {
  const q = indices.byId.get(indices.allIds[i]);
  view.innerHTML = `
    ${renderQuestion(q)}
    ${revealed ? renderAnswers(q) : ''}
    <div class="actions">
      ${revealed
        ? `<button id="next">Next →</button>`
        : `<button id="show">Show answer</button>`}
    </div>`;
  view.querySelector('#show')?.addEventListener('click', () => { revealed = true; render(); });
  view.querySelector('#next')?.addEventListener('click', () => {
    i = (i + 1) % indices.allIds.length; revealed = false; render();
  });
}
render();
