# Citizenship SRS

An offline, installable flashcard app for the **2025 USCIS civics test (128 questions)**, localized to **New Haven, CT (CT-3)**. It runs in any modern browser and installs to an Android home screen as a PWA. The default **Review** mode uses **slide-based SM-2** spaced repetition; five extra study modes drill the same deck different ways. All progress is stored locally in your browser — no accounts, no backend.

**Live app:** https://johnerichumphries.com/ctsrs/  (the `…github.io/ctsrs/` URL redirects here)

## Features

- **128 self-graded flashcards** — reveal the answer, then grade your own recall.
- **Preferred answers** — the easiest answer(s) to memorize are shown **bold first**; the rest appear under "Other acceptable answers" (toggle off in Settings).
- **Six study modes** (below) — five feed the one schedule; **Clusters** is study-only.
- **Works offline** after the first load; **installable** ("Add to Home Screen").
- **Resumes exactly** where you left off — Review position, an unfinished test mid-question, all learning intact.
- **Manual backup** — export/import your progress as JSON (the only way to move between devices).

## Study modes

| Mode | What it does |
|---|---|
| **Review** (default) | Continuous spaced repetition — surfaces the soonest-due card. 4 grades: Again / Hard / Good / Easy. |
| **Double-check** | Re-confirm cards you already know cold (mastered set). Wrong / Right. |
| **Clusters** | Drill questions grouped by shared answer, theme, or common confusion. Wrong / Right — **study-only** (doesn't affect scheduling). |
| **Wrong-most** | Focus on your most-missed cards (ranked by lapse rate). Wrong / Right. |
| **Practice test** | ~3 questions per category, scored with a per-category breakdown. |
| **Full test** | All 128 questions, scored with a per-category breakdown. |

Every grade — except in **Clusters**, which is study-only (its header often gives the answer away) — feeds the single SM-2 schedule, so a card you miss during a test resurfaces sooner in Review. Passing a test is **≥ 60%** (the 12/20 real-exam ratio).

## Install & use

1. Open the live app on your phone (Android Chrome): https://johnerichumphries.com/ctsrs/
2. Menu (⋮) → **Install app** / **Add to Home Screen**. It launches standalone and works offline.
3. Pick a mode and study. Tap the card (or press **Space**) to reveal the answer, then grade it:
   - Review: keys **1–4** = Again / Hard / Good / Easy.
   - Other modes: keys **1–2** = Wrong / Right.
4. **Browse** lists every card with its schedule state; **Settings** has tunables, export/import, and reset.

Your progress lives in this browser's `localStorage`. To move it to another device, use **Settings → Export** here and **Import** there.

## Deploy

Hosted free on **GitHub Pages** from the repo root of `main` (public repo).

1. Push to `main`.
2. **Settings → Pages → Build and deployment → Source: "Deploy from a branch" → Branch `main` / `/ (root)` → Save.**
3. The site goes live at `https://johnerichumphries.com/ctsrs/` (the `…github.io/ctsrs/` URL 301-redirects there, since the account uses a custom domain).

**When you update the app:** edit → commit → push, and **bump the service-worker cache version** (`CACHE = 'civics-vN'` in [`service-worker.js`](service-worker.js)) so installed clients pick up the change on the next reload.

To replace the icons, drop your own `icons/icon-192.png` and `icons/icon-512.png` (keep important art within the central ~80% for maskable safety) and bump the cache version.

## Development

No build step, no dependencies — plain HTML + CSS + ES modules.

- **Run the tests** (Node 24+) from the repo root:
  ```
  node --test
  ```
  (Run a single file by path, e.g. `node --test tests/sm2.test.mjs`. The bare-directory form `node --test tests/` is unsupported on this Node.)
- **Run locally** (a service worker + ES modules need an HTTP origin, not `file://`):
  ```
  python -m http.server 8000
  ```
  then open http://localhost:8000/.

Source layout: pure logic in `src/{sm2,grading,queue,sessions,store,deck}.js` (unit-tested, no DOM/storage/dates), DOM/glue in `src/{app,ui}.js`. The question data is `data/citizenship_2025_newhaven.json`; cluster groupings are `tools/clusters.json`.

## Data & provenance

Question text comes from a public-domain mirror of USCIS **M-1778 (09/25)** — the 2025 civics test — cross-checked for the 2025-specific answer updates. Answers are localized to **New Haven, CT (CT-3)**.

**Officeholder answers were web-verified on 2026-05-24** (President Trump, VP Vance, Speaker Johnson, Chief Justice Roberts, Governor Lamont, U.S. Senators Murphy & Blumenthal, Representative DeLauro, capital Hartford). These change over time: the 8 dynamic cards show a **"verify before interview"** badge — **re-verify before any real interview** at <https://www.uscis.gov/citizenship/testupdates>.

This is a personal study tool, not legal or immigration advice.
