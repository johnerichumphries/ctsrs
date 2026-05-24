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
