import { loadDeck } from './deck.js';
import { load, save } from './store.js';
import { nextReviewCardId } from './queue.js';
import { applyGrade } from './grading.js';
import {
  buildDoubleCheck, buildWrongMost, buildPractice, buildFull,
  buildClusters, clusterOrder, clusterHeaderAt, score,
} from './sessions.js';
import {
  renderQuestion, renderAnswers, renderReviewButtons, renderTwoButtons,
  renderStats, renderHome, renderClusterHeader, renderSummary, renderNav, renderBrowse,
} from './ui.js';

const view = document.getElementById('view');
const { deck, clusters, indices } = await loadDeck(
  './data/citizenship_2025_newhaven.json', './tools/clusters.json');
let state = load(deck);

let route = 'home';        // 'home' | 'card' | 'summary' | 'browse' | 'settings'
let session = null;        // null for review; object for finite modes
let clusterSegments = null;
let revealed = false;
let lastResult = null;

function masteredCount() {
  return Object.values(state.cards).filter((c) => c.interval >= state.settings.masteryThreshold).length;
}
function wrongCount() {
  return Object.values(state.cards).filter((c) => c.lapses >= 1 && c.timesSeen >= 3).length;
}

function startMode(mode) {
  revealed = false;
  if (mode === 'review') { session = null; route = 'card'; return render(); }
  let order;
  if (mode === 'double') order = buildDoubleCheck(state);
  else if (mode === 'wrong') order = buildWrongMost(state);
  else if (mode === 'practice') order = buildPractice(state, indices);
  else if (mode === 'full') order = buildFull(indices);
  else if (mode === 'clusters') { clusterSegments = buildClusters(clusters); order = clusterOrder(clusterSegments); }
  if (!order.length) { alert(emptyMessage(mode)); return render(); }
  session = { mode, grading: 'rightwrong2', order, cursor: 0, marks: {}, startedAtSlide: state.slidesSeen };
  state = { ...state, activeSession: session };
  save(state);
  route = 'card';
  render();
}

function emptyMessage(mode) {
  if (mode === 'double') return 'Nothing mastered yet — keep reviewing.';
  if (mode === 'wrong') return 'No problem cards yet 🎉';
  return 'No cards available.';
}

function currentCardId() {
  return session ? session.order[session.cursor] : nextReviewCardId(state);
}

function grade(q) {
  const id = currentCardId();
  state = applyGrade(state, id, q);
  if (session) {
    session.marks[String(id)] = q >= 3;
    session.cursor += 1;
    if (session.cursor >= session.order.length) return finishSession();
    state = { ...state, activeSession: session };
  }
  save(state);
  revealed = false;
  render();
}

function finishSession() {
  const scored = session.mode === 'practice' || session.mode === 'full';
  if (scored) {
    lastResult = score(session.order, session.marks, indices);
    state = {
      ...state,
      testHistory: [...state.testHistory, {
        mode: session.mode, atSlide: session.startedAtSlide,
        score: lastResult.score, total: lastResult.total,
        byCategory: lastResult.byCategory, finishedSlide: state.slidesSeen,
      }],
      activeSession: null,
    };
  } else {
    lastResult = { score: Object.values(session.marks).filter(Boolean).length, total: session.order.length, byCategory: {} };
    state = { ...state, activeSession: null };
  }
  save(state);
  session = null;
  route = 'summary';
  render();
}

function render() {
  if (route === 'home') return renderHomeView();
  if (route === 'summary') return renderSummaryView();
  if (route === 'browse') return renderBrowseView();   // Task 13
  if (route === 'settings') return renderSettingsView(); // Task 14
  return renderCardView();
}

function renderHomeView() {
  view.innerHTML = renderHome(state, { double: masteredCount(), wrong: wrongCount() }) + renderNav('home');
  view.querySelector('#resume')?.addEventListener('click', () => {
    session = state.activeSession;
    if (session.mode === 'clusters') clusterSegments = buildClusters(clusters);
    revealed = false; route = 'card'; render();
  });
  view.querySelectorAll('.mode').forEach((b) =>
    b.addEventListener('click', () => startMode(b.dataset.mode)));
  wireNav();
}

function renderCardView() {
  const id = currentCardId();
  const q = indices.byId.get(id);
  const card = state.cards[String(id)];
  const header = session
    ? `<header class="stats">${session.mode} · ${session.cursor + 1}/${session.order.length}</header>`
    : renderStats(state);
  const clusterHead = (session?.mode === 'clusters')
    ? renderClusterHeader(clusterHeaderAt(clusterSegments, session.cursor)) : '';
  view.innerHTML = `
    ${header}${clusterHead}
    ${renderQuestion(q)}
    ${revealed ? renderAnswers(q, state.settings.showPreferredOnly) : ''}
    <div class="actions">
      ${revealed
        ? (session ? renderTwoButtons() : `<div class="grades">${renderReviewButtons(card, state.settings.maxGap)}</div>`)
        : `<button id="show">Show answer</button>`}
    </div>` + renderNav(null);
  view.querySelector('#show')?.addEventListener('click', () => { revealed = true; render(); });
  view.querySelectorAll('.grade').forEach((b) => b.addEventListener('click', () => grade(Number(b.dataset.q))));
  wireNav();
}

function renderSummaryView() {
  view.innerHTML = renderSummary(lastResult) + renderNav('home');
  view.querySelector('#home-btn')?.addEventListener('click', () => { route = 'home'; render(); });
  wireNav();
}

function wireNav() {
  view.querySelectorAll('[data-nav]').forEach((b) =>
    b.addEventListener('click', () => { route = b.dataset.nav; session = null; revealed = false; render(); }));
}

document.addEventListener('keydown', (e) => {
  if (route !== 'card') return;
  if (!revealed && (e.key === ' ' || e.key === 'Enter')) { revealed = true; render(); e.preventDefault(); }
  else if (revealed && session && ['1', '2'].includes(e.key)) grade([0, 4][Number(e.key) - 1]);
  else if (revealed && !session && ['1', '2', '3', '4'].includes(e.key)) grade([0, 3, 4, 5][Number(e.key) - 1]);
});

// Browse/Settings placeholders until Tasks 13–14 land:
let browseFilter = { cat: 'all', text: '' };
function renderBrowseView() {
  view.innerHTML = renderBrowse(deck, state, browseFilter) + renderNav('browse');
  view.querySelector('#cat')?.addEventListener('change', (e) => { browseFilter.cat = e.target.value; render(); });
  view.querySelector('#search')?.addEventListener('input', (e) => { browseFilter.text = e.target.value; renderBrowseView(); });
  wireNav();
}
function renderSettingsView() { view.innerHTML = '<p>Settings</p>' + renderNav('settings'); wireNav(); }

render();
