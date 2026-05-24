# Citizenship SRS — Build Plan (Claude Code)

A personal, single-user flashcard app for the **2025 USCIS civics test (128 questions)**, localized to **New Haven, CT**. Runs on desktop and Android as an installable, offline PWA. The default **Review** mode schedules with **slide-based SM-2** (SM-2's math retimed from calendar days to "slides" — cards shown — so it runs continuously with no daily limits; see §3.3 and `docs/superpowers/specs/2026-05-24-slide-based-sm2-scheduling-design.md`). Five additional **study modes** (§3.10) drill the same deck in different ways — double-check, clusters, wrong-most, practice test, full test — all feeding the one schedule.

This document is the spec and the source of truth. Decisions in §3 are **locked** unless the open questions in §11 say otherwise — do not re-litigate them mid-build. It integrates three approved design specs in `docs/superpowers/specs/`: slide-based SM-2 scheduling, preferred ("best") answers, and study modes.

---

## 1. Goal & non-goals

**Goal.** A working PWA that:
- Drills all 128 questions as self-graded flashcards.
- Offers **six study modes** (§3.10): continuous **Review** (slide-based SM-2, adaptive ordering) plus **Double-check**, **Clusters**, **Wrong-most**, **Practice test**, and **Full test**.
- Persists all schedule + session state across reloads, so reopening on the same device/browser **resumes exactly** — Review where it left off, an unfinished test mid-question, learning intact.
- Works offline and installs to an Android home screen.
- Is hosted, for free, on GitHub Pages, maintained by one person (me).

**Non-goals (out of scope).**
- No accounts, no backend, no multi-user, no server-side anything.
- No cross-device sync engine (manual JSON export/import only — see §3.7).
- No 2008/100-question version, no non-English languages.
- No FSRS (slide-based SM-2 only; FSRS noted as a future swap in §12).
- No typed-answer checking / NLP grading (self-grade only — §3.6), in **any** mode.
- No per-mode separate schedules — there is exactly one schedule; modes are different lenses on it (§3.10).

**Success = I can:** open the URL on my phone, "Add to Home Screen," pick a mode, study, close the app, reopen later (next day or whenever), and resume where I left off — Review surfaces worst-known cards first, an interrupted test resumes mid-question — all offline.

---

## 2. Architecture summary

- **Type:** static PWA. No build step, no bundler, no framework. **Vanilla JS (ES modules) + HTML + CSS.**
- **Persistence:** `localStorage`, single JSON blob (schedule + session state for ≤128 cards is far under the ~5 MB quota; sync API keeps code simple). IndexedDB is unnecessary at this scale.
- **Hosting:** GitHub Pages, served from repo root of `main`, **public repo** (Pages on private repos needs a paid plan; the content is public-domain USCIS material, so public is fine).
- **Offline:** service worker precaches the app shell + question/cluster JSON (cache-first).
- **Cards:** sourced from `data/citizenship_2025_newhaven.json` (provided; schema in §5). Cluster groupings from `tools/clusters.json`.
- **One engine, many lenses:** a single pure scheduler (`sm2.js`) and a single grading pipeline (`grading.js`) serve every mode; modes differ only in **card selection** and **grade-button granularity** (§3.10).

Rationale for "no build step": Pages serves files as-is, relative paths just work, and there is no CI/transpile/deploy action to maintain. A bundler (Vite) buys module ergonomics we don't need for a handful of files and costs a `gh-pages` build/deploy workflow. See §10 alternative if this is ever revisited.

---

## 3. Locked design decisions

### 3.1 Card direction
Question → answer only. No reverse cards. The real test is oral recall of the answer given the question.

### 3.2 Grading UI: Review uses 4 buttons → SM-2 quality `q`
| Button | `q` | Meaning |
|---|---|---|
| Again | 0 | failed recall |
| Hard  | 3 | recalled with serious difficulty (min passing) |
| Good  | 4 | recalled correctly |
| Easy  | 5 | recalled effortlessly |

This mapping makes the math behave: Good (`q=4`) leaves EF ~unchanged, Easy (`q=5`) raises it, Hard (`q=3`) lowers it, Again is a lapse. Effects are expressed in **slides** (cards shown), not days — see §3.3. Each button previews its resulting gap (e.g. "≈ 12 slides"). The five non-Review modes use a **2-button Wrong/Right** UI that maps to `q=0`/`q=4` (§3.10).

### 3.3 Slide-based SM-2 (continuous scheduling)
SM-2's math, retimed from calendar **days** to **slides** (one "slide" = one card shown and graded). There is no calendar, clock, timezone, or midnight. Full design + rationale: `docs/superpowers/specs/2026-05-24-slide-based-sm2-scheduling-design.md`.

**Global clock:** a single integer `slidesSeen`, incremented by 1 every time a card is shown and graded **in any mode**.

Per-card state: `ef` (ease factor, init **2.5**), `interval` (gap in **slides**), `reps` (consecutive successes), `dueSlide` (the `slidesSeen` value at which the card becomes due), plus bookkeeping `lapses`, `lastSeenSlide`, `timesSeen` (total grades, any mode — drives wrong-most ranking, §3.10).

Constants: `FIRST = 5`, `SECOND = 12`, `LAPSE_GAP = 3`, `MAX_GAP = 400` (exposed as `settings.maxGap`).

On review with quality `q`:

```
if q >= 3:                      // pass
    if reps == 0:      interval = FIRST          // 5
    elif reps == 1:    interval = SECOND         // 12
    else:              interval = round(interval * ef)
    reps += 1
    ef = ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
    if ef < 1.3: ef = 1.3
    if interval > MAX_GAP: interval = MAX_GAP    // 400
else:                           // lapse (q < 3)
    reps = 0
    interval = LAPSE_GAP        // 3
    lapses += 1
    // ef intentionally NOT changed on lapse (original SM-2 behavior)
```

The **caller** (`grading.js`, not the pure `sm2.js` module) then sets `dueSlide = slidesSeen + jitter(interval)`, where `jitter(x) = max(1, round(x * (0.85 + random()*0.30)))` (±15%), increments `slidesSeen`, increments `timesSeen`, and records `lastSeenSlide`.

Notes for the implementer:
- A card is **due** when `dueSlide <= slidesSeen`; the next Review card is always the one with the smallest `dueSlide` (see §3.5).
- Worked example (all Good, `ef` 2.5): intervals `5 → 12 → 30 → 75 → 188 → 400 (capped from 470) → 400 …` — a mastered card resurfaces ~once per 400 slides.
- Keep `sm2.js` a standalone, **pure** module exporting `schedule(state, q) -> newState` that returns exactly `{ef, interval, reps, lapses}` in slides — **no DOM, no storage, no dates, no jitter, no global counter** (jitter, `dueSlide`, `slidesSeen`, `timesSeen` are the caller's job, §3.5/§4). It must be unit-testable in Node (§9).

### 3.4 Lapse behavior (native same-session relearn)
A lapse (**Again**/**Wrong**, `q < 3`) resets the card to `interval = LAPSE_GAP` (3 slides) and `reps = 0`, so `dueSlide = slidesSeen + ~3`. In Review the card therefore reappears within a few slides automatically. The old `relearnInSession` toggle is **removed** — same-session relearn is now intrinsic to the slide model. Tune `LAPSE_GAP` (§3.3) if "a few slides" should be sooner or later.

### 3.5 Review selection (continuous, no daily queue, no new-card drip)
All 128 cards are **live from the first slide** — there is no "new cards introduced today" logic and no daily caps. At first init, every card gets a stored record (`ef 2.5, reps 0, interval 0, timesSeen 0`) with `dueSlide` seeded from a **one-time random shuffle** of `0..127`, so the first pass through the deck is shuffled and a card missed during it re-appears within it.

Each Review step:
1. Pick the card with the smallest `dueSlide` (most overdue); tie-break by `id`. Because each `dueSlide` was assigned with ±15% jitter (§3.3), the order is non-rigid, not perfectly periodic — selection itself adds no randomness.
2. Show it; user self-grades (§3.6) with the 4 buttons.
3. Update state via `grading.js` (`sm2.js` + `dueSlide` + counters).

There is **no "due today" gate and no "all done for today" screen** — Review is one continuous stream; there is always a next card (the soonest-due). When everything is well-learned the next card's gap is simply large; surface that as a soft "caught up / mastery" stat (§7), not a blocking empty state.

### 3.6 Self-grading, not answer-matching
Show the question; on tap/space reveal **all** acceptable answers; user self-assesses and presses a grade button. For "name one…" the user needs only one; for `answerCount > 1` the UI displays the required count ("name 2") and reveals all valid options. No free-text checking (brittle for open answers; over-engineering for a personal app). This applies in every mode.

### 3.7 Cross-device state: none (manual transfer only)
Each device keeps its own `localStorage` state. Provide **Export** (download `srs_state.json`) and **Import** (file picker, replace state) in Settings. The exported blob includes the full schedule, settings, `testHistory`, and any `activeSession`. No gist/Drive sync (future, §12).

### 3.8 Dynamic / officeholder cards
8 cards (ids `23, 29, 30, 38, 39, 57, 61, 62`) carry `"dynamic": true` and `"verifyBeforeInterview": true`. Behavior:
- Scheduled and graded like any other card in every mode (do **not** exclude from any queue or test).
- Render a small **"verify before interview"** badge and a one-line note linking `https://www.uscis.gov/citizenship/testupdates`.
- Their answers are hardcoded in the JSON (verified 2026-05-24, New Haven/CT-3). Updating = edit JSON, redeploy.

### 3.9 Preferred ("best") answers
Each question carries `preferredAnswers` — a subset of `answers` (exact string matches) marking the easiest answer(s) to memorize: one for single-answer questions, or **`answerCount + 1`** for multi-answer questions (the required number plus one backup). Picks favor, in order: **reuse** (an answer that is also the best of other questions — e.g. "The President (of the United States)" covers Q42–45), then **familiarity/recognizability**, then **brevity**. Full curated list and rationale: `docs/superpowers/specs/2026-05-24-preferred-answers-design.md`.

Display (on reveal, all card-showing modes): render `preferredAnswers` first and **bold**; show the remaining answers under a muted "Other acceptable answers" line. Setting `showPreferredOnly` (default **false**) hides the non-preferred answers entirely. Highlighting is display-only — it never affects grading or scheduling.

### 3.10 Study modes (six lenses on one schedule)
Full design: `docs/superpowers/specs/2026-05-24-study-modes-design.md`.

**Unifying principle.** One deck, one scheduler (`sm2.js`), one `slidesSeen` clock, one `localStorage` blob. Modes differ in only two ways: **(a) which cards they select and in what order**, and **(b) the grade UI** (4-button Review vs. 2-button Wrong/Right). **Every grade in every mode** flows through the single grading pipeline (`grading.js`) that runs `sm2.js`, sets `dueSlide`+jitter, and bumps `slidesSeen`/`timesSeen`/`lastSeenSlide`. Because the five non-Review modes select cards **without consulting `dueSlide`**, their SM-2 updates are invisible *within* that mode and only surface as ordering when the user returns to **Review** — i.e. *Wrong/Right informs the algorithm, but only affects ordering back in Review*.

**Grade mapping (2-button modes):** **Wrong = `q=0`** (lapse), **Right = `q=4`** (Good). Hard/Easy granularity exists only in Review.

| Mode | Card selection | Grade UI (`q`) | Finite? | Scored? |
|---|---|---|---|---|
| **Review** (default) | soonest-due (`min dueSlide`, tie-break `id`), continuous | Again/Hard/Good/Easy → 0/3/4/5 | no (stream) | no |
| **Double-check** | mastered set: `interval ≥ masteryThreshold` (default **75**), shuffled | Wrong/Right → 0/4 | yes (one pass) | no |
| **Clusters** | `tools/clusters.json` sets, group-by-group: `sameAnswer` → `thematic` → `confusionPairs` (note shown as "don't confuse" hint) | Wrong/Right → 0/4 | yes | no |
| **Wrong-most** | cards with `lapses ≥ 1` & `timesSeen ≥ 3`, ranked by lapse rate `lapses/timesSeen` desc (tie-break `lapses`, `id`) | Wrong/Right → 0/4 | yes | no |
| **Practice test** | `practicePerCategory` (default **3**) random per category, combined & shuffled (~21) | Wrong/Right → 0/4 | yes | ✅ score + per-category |
| **Full test** | all 128, shuffled | Wrong/Right → 0/4 | yes | ✅ score + per-category |

**Per-mode notes:**
- **Double-check** — snapshot the mastered set at session start; a card marked Wrong lapses (interval → 3) and falls out of the set next time. The mastered cutoff `masteryThreshold` is a Setting (75 ≈ four-plus correct in a row, the 4th step `5→12→30→75`).
- **Clusters** — within a set, show its questions back-to-back so the connection lands; a header names the set ("Same answer: The President" / "Theme: World War II" / "Don't confuse: …"). Cluster data is display/selection-only; it never affects scheduling.
- **Wrong-most** — the `timesSeen ≥ 3` floor stops a single early miss (`1/1`) from dominating the ranking.
- **Practice / Full test** — on completion show **score/total**, **pass/fail** (pass when `correct/total ≥ 0.6`, the 12/20 real-exam ratio), and a **per-category breakdown**; append the result to `testHistory` (§6).

**Persistence & resume.** Finite sessions persist in `activeSession` (mode, ordered ids, cursor, marks, start slide); reopening the app resumes an unfinished test at the same question. The SM-2 effect of each grade is written to `cards` at grade time, so abandoning a test keeps whatever learning already happened. Review needs no saved order (recomputed each step from `dueSlide`).

---

## 4. Repository layout

```
ctsrs/                           # repo root = Pages publish dir (repo: johnerichumphries/ctsrs)
├── index.html                   # app shell; registers SW; loads ES modules
├── styles.css
├── src/
│   ├── app.js                   # bootstrap, mode launcher, session orchestration, routing
│   ├── sm2.js                   # PURE scheduling fn (unit-tested) — no dates/jitter/storage
│   ├── grading.js               # single apply-a-grade pipeline (sm2 + dueSlide/jitter + counters)
│   ├── deck.js                  # load + validate question JSON & clusters.json; category/cluster indices
│   ├── queue.js                 # Review continuous selection (min dueSlide), init shuffle, jitter, slidesSeen
│   ├── sessions.js              # finite session builders (double-check/clusters/wrong-most/practice/full) + score()
│   ├── store.js                 # localStorage load/save, export/import, migration, testHistory, activeSession
│   └── ui.js                    # render card, reveal, grade buttons (2/4), stats, mode launcher, test summary, settings
├── data/
│   └── citizenship_2025_newhaven.json   # provided; card source of truth
├── icons/
│   ├── icon-192.png             # TODO (§8.4)
│   └── icon-512.png             # TODO (§8.4)
├── manifest.webmanifest
├── service-worker.js
├── tests/
│   ├── sm2.test.mjs             # node --test, no deps
│   ├── grading.test.mjs         # node --test — apply-grade pipeline (NEW)
│   ├── sessions.test.mjs        # node --test — session builders + score() (NEW)
│   ├── preferred_answers.test.mjs  # validates preferredAnswers (node --test)
│   └── clusters.test.mjs        # validates tools/clusters.json against the deck (node --test)
├── tools/
│   ├── preferred_answers.json   # id → preferred-answers map (source of §3.9 picks)
│   ├── apply_preferred.mjs      # one-shot: writes preferredAnswers into the deck JSON
│   └── clusters.json            # reuse/relationship data: clusters mode (§3.10) + display hints
├── docs/superpowers/
│   ├── specs/                   # design specs (slide-SM2, preferred answers, study modes)
│   └── plans/                   # implementation plans
├── README.md                    # deploy + usage (write during finish milestone)
└── PLAN.md                      # this file (master spec)
```

**Path discipline:** every asset path (HTML, manifest, SW registration, fetch of JSON) must be **relative** (`./…`), because Pages serves under `https://USER.github.io/REPO/`. Absolute `/…` paths will 404. SW scope must be the relative app root.

---

## 5. Data: question JSON schema

File: `data/citizenship_2025_newhaven.json`. Top-level `{ meta, questions[] }`.

`meta` (informational): `test_version`, `source` (USCIS M-1778 09/25), `source_url`, `question_count` (128), `location_context`, `dynamic_answers_verified`, `officials_note`, `interview_rules`.

Each `questions[i]`:
```jsonc
{
  "id": 38,                       // 1..128, stable, use as card key
  "question": "What is the name of the President of the United States now?",
  "answers": ["Donald Trump"],    // 1+ acceptable answers; [] never occurs (dynamics filled)
  "preferredAnswers": ["Donald Trump"], // subset of answers to bold/memorize (1, or answerCount+1)
  "answerCount": 1,               // how many the user must produce
  "seniorExemption": false,       // true for the 20 65/20 questions (asterisked)
  "stateSpecific": true,          // answer depends on state
  "officialField": "president",   // null, or which official it tracks
  "category": "System of Government",
  "dynamic": true,                // officeholder/state card → show verify badge
  "verifyBeforeInterview": true
}
```

The **7 categories** (counts, used by the practice test's per-category draw): Principles of American Government (15), System of Government (47), Rights and Responsibilities (10), Colonial Period and Independence (17), 1800s (10), Recent American History (19), Symbols and Holidays (10).

Counts to assert at load (sanity check, fail loud if wrong):
- 128 questions, ids contiguous 1..128.
- Exactly 8 with `dynamic: true` (ids 23,29,30,38,39,57,61,62), all non-empty `answers`.
- 20 with `seniorExemption: true`.
- 7 categories (counts above).
- Every question has `preferredAnswers`; each entry exactly matches one of its `answers`; length is 1 when `answerCount == 1`, else `answerCount + 1`.

Also validate `tools/clusters.json` at load/test time (§9): all referenced ids ∈ 1..128; each `sameAnswer` cluster's `answer` is present in every listed question's `preferredAnswers`.

**Provenance caveat (carry into README):** question text is from a public-domain GitHub mirror of USCIS **M-1778 (09/25)**, cross-checked for the 2025-specific answer changes (Q31/Q41/Q68/Q97) and integrity. Officeholders were independently web-verified on **2026-05-24**. Re-verify dynamic answers near any real interview date.

---

## 6. SRS state schema (localStorage)

Key: `citizenship_srs_v1`. Value (JSON):
```jsonc
{
  "version": 3,
  "slidesSeen": 137,
  "cards": {
    "38": { "ef": 2.5, "interval": 30, "reps": 3, "dueSlide": 165,
            "lapses": 0, "lastSeenSlide": 135, "timesSeen": 7 }
    // ALL 128 cards present from first init (seeded via a one-time shuffle)
  },
  "settings": {
    "maxGap": 400,
    "showPreferredOnly": false,
    "masteryThreshold": 75,        // double-check cutoff (§3.10)
    "practicePerCategory": 3       // practice-test size per category (§3.10)
  },
  "testHistory": [                 // rolling, append-only (practice + full)
    { "mode": "full", "atSlide": 137, "score": 118, "total": 128,
      "byCategory": { "System of Government": { "correct": 44, "total": 47 } /* … */ },
      "finishedSlide": 265 }
  ],
  "activeSession": {               // null when no finite session in progress
    "mode": "practice", "grading": "rightwrong2",
    "order": [12, 88, 5 /* … */], "cursor": 7,
    "marks": { "12": true, "88": false /* … */ }, "startedAtSlide": 140
  }
}
```
- Every card has a record from first init (the old "absent ⇒ new" rule is gone); a card is **due** when `dueSlide <= slidesSeen`.
- `timesSeen` increments on every grade in every mode (drives wrong-most ranking).
- `activeSession` holds only session bookkeeping — each grade's SM-2 effect is already written to `cards`, so abandoning a test keeps the learning.
- **Removed vs. the old day-based schema:** the `daily` block, `newPerDay`, `maxReviewsPerDay`, `relearnInSession`, and per-card `due`/`lastReviewed`.
- **Migrate on `version` bump** (now **3**): from v2, add `timesSeen: 0` per card, default `masteryThreshold`/`practicePerCategory`, set `testHistory: []`, `activeSession: null`. Never silently drop user state.

---

## 7. UI / screens

Single-page app. Bottom nav (thumb-reachable on phone): **Home · Browse · Settings**.

1. **Home** (mode launcher)
   - Six mode entries: **Review** (highlighted as default), Double-check, Clusters, Wrong-most, Practice test, Full test. Each shows a one-line description and, where relevant, a live count (e.g. Double-check "n mastered"; Wrong-most "n problem cards").
   - A **"Resume test"** banner when `activeSession` is non-null → jumps back into the in-progress test.
   - A compact **history** strip: recent `testHistory` results (score + slide #). (May live in Settings instead — implementer's call.)
   - Soft/empty states: Double-check before anything is mastered → "Nothing mastered yet — keep reviewing." Wrong-most with no qualifying lapses → "No problem cards yet 🎉." Clusters and both tests are always available.

2. **Card surface** (shared by all modes)
   - Header: continuous stats — `Slides: n · Mastered: n/128 · Weak: n` (no daily counters). "Mastered" = cards at/above `masteryThreshold`; "Weak" = cards with low `interval`/recent lapses. In finite modes, also show progress (e.g. "7 / 21").
   - Card: category chip; question text large; dynamic badge if applicable; in Clusters mode, a set header ("Same answer: …").
   - "Show answer" (tap card / Space) → reveals answer list; for `answerCount>1` show "Name N".
   - On reveal, `preferredAnswers` render first and **bold** ("memorize these"); remaining answers show under a muted "Other acceptable answers" line (hidden when `settings.showPreferredOnly`). In Clusters mode, a `confusionPairs` note renders as a "don't confuse" hint.
   - Grade row: **Review** shows Again/Hard/Good/Easy (keys 1–4), each with its next-gap preview ("≈ 12 slides") via an `sm2.js` dry-run (jitter excluded so the preview is stable). **The five other modes** show **Wrong / Right** (keys 1–2).
   - Review has no empty state — it is continuous (§3.5). Finite modes end on a recap/summary screen.

3. **Test summary** (after Practice / Full test)
   - Score / total, pass/fail (≥ 60%), per-category breakdown, and a "back to Home" action. Result appended to `testHistory`.

4. **Browse**
   - Filter by category / dynamic / senior-exemption; search box.
   - Tap a card to see Q + answers + its schedule state (ease, interval in slides, `dueSlide`, lapses, timesSeen). Read-only.

5. **Settings**
   - `maxGap` (how rarely mastered cards return; default 400), `masteryThreshold` (double-check cutoff; default 75), `practicePerCategory` (default 3), `showPreferredOnly`.
   - **Export** state, **Import** state, **Reset** (with confirm).
   - About: data provenance + testupdates link.

Keep styling minimal, high-contrast, large tap targets, system font stack, dark-mode via `prefers-color-scheme`. No UI framework.

---

## 8. PWA specifics

### 8.1 `manifest.webmanifest`
```jsonc
{
  "name": "Citizenship SRS",
  "short_name": "Civics",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#0b0b0c",
  "theme_color": "#0b0b0c",
  "icons": [
    { "src": "./icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "./icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

### 8.2 `service-worker.js`
- Cache-first for the precached shell; `CACHE = "civics-vN"` constant — **bump N on every deploy** to invalidate.
- Precache: `./`, `index.html`, `styles.css`, `src/*.js`, `manifest.webmanifest`, `data/citizenship_2025_newhaven.json`, `tools/clusters.json`, `icons/*`.
- `install` → precache + `skipWaiting()`. `activate` → delete old caches + `clients.claim()`.
- Network-first is unnecessary (content is static and versioned).

### 8.3 Install
Android Chrome offers "Install app" once manifest + SW + HTTPS criteria are met. Document the "Add to Home Screen" path in README. (iOS is out of scope but generally works in a degraded way.)

### 8.4 Icons — **TODO during build**
Need `icon-192.png` and `icon-512.png` (512 should be maskable-safe: keep content within the central ~80%). Quick options: generate a flat tile with "🇺🇸/Civics" text, or any placeholder; replace later. Not a blocker for logic milestones.

---

## 9. Testing & acceptance

**Unit (sm2.js), `node --test tests/sm2.test.mjs`, no deps.** Assert:
- New card, Good×: intervals 5 → 12 → round(12·ef)=30 → … ; `reps` increments; `interval` capped at `MAX_GAP` (400).
- `q=4` leaves `ef` unchanged (±1e-9); `q=5` raises by 0.1; `q=3` lowers by 0.14.
- `ef` floored at 1.3 after repeated Hard.
- Again (`q=0`): `reps→0`, `interval→3` (`LAPSE_GAP`), `ef` unchanged, `lapses+1`.
- Purity: `schedule()` output keys are exactly `ef, interval, reps, lapses` — no date, no `dueSlide`, no jitter, no counters.

**Grading (`tests/grading.test.mjs`), `node --test`, no deps.** Assert applying `q` writes the expected SM-2 delta to the card and bumps `slidesSeen` + `timesSeen` + `lastSeenSlide`; `dueSlide` lands in the jittered range; Wrong=`q=0` / Right=`q=4` mapping is correct.

**Sessions (`tests/sessions.test.mjs`), `node --test`, no deps.** Builders are pure `(state, deck) → ids[]`. Assert:
- Practice picks exactly `practicePerCategory` per category (and reports the categories).
- Full test = all 128 ids exactly once.
- Wrong-most includes only `lapses ≥ 1` & `timesSeen ≥ 3`, ordered by lapse rate desc with correct tie-breaks; empty when none qualify.
- Double-check returns only cards with `interval ≥ masteryThreshold`.
- Clusters mirror `clusters.json` groups (sameAnswer → thematic → confusionPairs).
- `score()` computes correct/total and per-category breakdown correctly.

**Data (`tests/preferred_answers.test.mjs`), `node --test`, no deps.** Assert every question has `preferredAnswers`; each entry exactly matches an element of `answers`; length is 1 when `answerCount == 1`, else `answerCount + 1`; no duplicates within a question.

**Clusters (`tests/clusters.test.mjs`), `node --test`, no deps.** Assert each `sameAnswer` cluster's `answer` is present in every listed question's `preferredAnswers`; all `thematic`/`confusionPairs` ids are valid (1..128), ≥2 per group, no dupes. (On this Node, run test files by path — `node --test tests/*.test.mjs` — the bare-directory form is unsupported.)

**Manual acceptance checklist:**
- [ ] Loads offline after first visit (DevTools → Offline, reload works).
- [ ] Installable on Android (install prompt appears; launches standalone).
- [ ] Grade a card → reload → schedule persisted (`slidesSeen`, `dueSlide`, `timesSeen` correct).
- [ ] All 128 cards are live from first run (no new-card drip); the first Review pass is shuffled.
- [ ] Again/Wrong resets the card and it reappears within ~3 slides in Review (native relearn, §3.4).
- [ ] A mastered card (interval at `MAX_GAP`) still recirculates within ~`MAX_GAP` slides in Review.
- [ ] Dynamic cards show verify badge + correct New Haven answers (Trump, Vance, Johnson, Roberts, Lamont, Murphy, DeLauro, Hartford) in every mode.
- [ ] Home lists all six modes; selecting each starts the right selection; Review is default.
- [ ] Double-check shows only mastered cards and shrinks after a Wrong; empty state before any mastery.
- [ ] Clusters plays sameAnswer → thematic → confusionPairs, set headers correct, "don't confuse" note shown.
- [ ] Wrong-most shows worst-by-lapse-rate first; empty state when no qualifying lapses.
- [ ] Practice test draws `practicePerCategory` per category; full test draws all 128; both show score + per-category + pass/fail; result lands in `testHistory`.
- [ ] Missing cards in a test surfaces them sooner on returning to Review (modes feed the one schedule).
- [ ] Close mid-test → reopen → resumes at the same question (`activeSession`).
- [ ] Export → Reset → Import round-trips state exactly (incl. `testHistory`, `activeSession`).
- [ ] Load-time sanity assertions (§5) pass; corrupt/old (v2) state migrates to v3, not crashes.
- [ ] Reveal shows bold preferred answer(s) first; "Other acceptable answers" lists the rest; `showPreferredOnly` hides them.

---

## 10. Deploy to GitHub Pages

1. Repo is **`johnerichumphries/ctsrs`** (already exists); ensure it is **public** (Pages on free plans needs public) and push all files to `main`.
2. **Settings → Pages → Build and deployment → Source: "Deploy from a branch" → Branch: `main` / `/ (root)` → Save.**
3. Wait for the green check; site at `https://johnerichumphries.github.io/ctsrs/`.
4. Open on desktop to verify; then on Android Chrome → ⋮ → **Install app / Add to Home Screen**.
5. **Updating:** edit → commit → push; **bump the SW cache version** (`civics-vN`) so clients refresh. With `skipWaiting()`+`clients.claim()`, one reload after the SW updates picks up changes (occasionally two).

Alternative (only if §2 "no build step" is ever reversed): Vite + a `gh-pages` GitHub Action publishing `dist/` to a `gh-pages` branch, with `base: "/ctsrs/"` set in `vite.config`. Not recommended for this scope.

---

## 11. Open questions / tunables (decide before/while building)

1. **`maxGap`** (how rarely mastered cards return; default 400, `settings.maxGap`) — revisit 300–600 after real use.
2. **`masteryThreshold`** (double-check cutoff; default 75) — feel parameter; retune after use.
3. **`practicePerCategory`** (default 3 → ~21-question practice test) — retune for desired length.
4. **Practice "pass" rule** — currently the 60% ratio (`correct/total ≥ 0.6`) rather than the literal 12/20. Revisit if a stricter exact-rule exam mode is wanted.
5. **Hard button:** keep pure SM-2 (Hard = normal growth with EF penalty) or add Anki-style Hard = `interval × 1.2`? Default: pure SM-2.
6. **Leeches:** flag cards with `lapses ≥ 8` for attention? Default: no — wrong-most already surfaces the worst offenders.
7. **Sync:** confirm manual export/import is enough, or add a later gist/Drive sync milestone?
8. **Oral practice:** add Web Speech `SpeechSynthesis` to read the question aloud (the real test is oral)? Default: defer to §12.
9. **Senior 65/20 mode:** ✅ **Decided (2026-05-24): include a filter.** Add a Study/Browse filter to drill only the 20 `seniorExemption` cards (the asterisked set). A dedicated 65/20 *test* (10 asked, pass 6) reusing the test machinery is deferred (§12). Data already supports it; no scheduling change.
10. **Repo name / username:** ✅ **Resolved** — `johnerichumphries/ctsrs`; Pages URL `https://johnerichumphries.github.io/ctsrs/`. Manifest display name stays "Citizenship SRS". Ensure the repo is public before enabling Pages.
11. **Icons:** generate a placeholder now or supply your own?

---

## 12. Future extensions (explicitly deferred)

- **TTS oral mode** (SpeechSynthesis) for question read-aloud.
- **FSRS swap:** replace `sm2.js` with the `ts-fsrs` package behind the same `schedule()` interface; add a `desiredRetention` setting. State schema would gain `stability`/`difficulty`. Caveat: FSRS is time-based, so adopting it would reintroduce a real-time clock and reverse the §3.3 slide model — a deliberate trade, not a drop-in.
- **Senior 65/20 *test* mode:** 10 random `seniorExemption` questions, pass at 6/10, reusing the §3.10 test machinery and `testHistory`.
- **Richer stats:** retention %, due-forecast, per-category mastery over time (building on `testHistory`).
- **2008/100-question deck** as a selectable second deck (the JSON schema already generalizes).
- **Sync** via GitHub Gist (token) or Google Drive appData.
- **Leech handling:** auto-flag `lapses ≥ N` for a dedicated leech list (wrong-most is the lightweight stand-in for now).
- **Cluster display polish:** beyond the Clusters *mode*, optionally surface "Same answer as Q…" inline on reveal in other modes too (display-only). (The external dataset's `keywords`/`common_wrong` fuzzy-grading idea is **rejected** — it conflicts with the locked self-grade decision §3.6.)

---

## 13. Suggested Claude Code milestone order

Build in vertical slices; each milestone should end green and committable.

- **M0 — Pipeline:** repo + minimal `index.html` ("hello") deployed to Pages; confirm the relative-path/base-URL behavior on the live URL. *Accept:* live page loads.
- **M1 — Render:** `deck.js` loads JSON (with §5 assertions), show one card, reveal answers (bold preferred first), render grade buttons (no persistence, no scheduling). *Accept:* can flip through cards.
- **M2 — Engine:** `sm2.js` + `tests/sm2.test.mjs` passing under `node --test`. *Accept:* all §9 unit assertions pass.
- **M3 — Review (persistence & queue):** `store.js` + `grading.js` + `queue.js`; Review mode end-to-end — grading updates state via the pipeline, smallest-`dueSlide` selection, one-time init shuffle, ±15% jitter, `slidesSeen`/`timesSeen`. (No daily caps, no midnight reset, no relearn toggle — relearn is native, §3.4.) `tests/grading.test.mjs`. *Accept:* §9 persistence/queue items pass.
- **M4 — PWA:** `manifest.webmanifest` + `service-worker.js`; offline + installable. *Accept:* offline reload + Android install work.
- **M5 — Modes:** Home launcher + `sessions.js` (double-check, clusters, wrong-most, practice, full) + 2-button grade UI + scoring/summary + `testHistory` + `activeSession` resume + empty states. `tests/sessions.test.mjs`. *Accept:* §9 mode/session + resume items pass.
- **M6 — Polish:** Browse + Settings views, dynamic badges + testupdates note, export/import/reset (incl. history/session), dark mode, next-interval previews on Review buttons, history strip. *Accept:* remaining checklist items.
- **M7 — Finish:** icons, `README.md` (deploy + usage + provenance), final acceptance pass, tag `v1.0`.

**Conventions for the build:** vanilla ES modules, no framework, no build step, all paths relative, `sm2.js` stays pure/side-effect-free and **date-free** (slides only; jitter + `dueSlide` + counters live in `grading.js`/`queue.js`), every mode grades through the one `grading.js` pipeline, fail loud on bad data, never silently drop saved state on migration.
