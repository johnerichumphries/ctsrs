# Citizenship SRS — Build Plan (Claude Code)

A personal, single-user spaced-repetition flashcard app for the **2025 USCIS civics test (128 questions)**, localized to **New Haven, CT**. Runs on desktop and Android as an installable, offline PWA. Scheduling uses **slide-based SM-2** — SM-2's math retimed from calendar days to "slides" (cards shown), so it runs continuously with no daily limits (see §3.3 and `docs/superpowers/specs/2026-05-24-slide-based-sm2-scheduling-design.md`).

This document is the spec. It is written to be handed to Claude Code as the source of truth. Decisions in §3 are **locked** unless the open questions in §11 say otherwise — do not re-litigate them mid-build.

---

## 1. Goal & non-goals

**Goal.** A working PWA that:
- Drills all 128 questions as self-graded flashcards.
- Schedules reviews with **slide-based SM-2** (continuous, no daily limits) and persists schedule across reloads.
- Works offline and installs to an Android home screen.
- Is hosted, for free, on GitHub Pages, maintained by one person (me).

**Non-goals (out of scope).**
- No accounts, no backend, no multi-user, no server-side anything.
- No cross-device sync engine (manual JSON export/import only — see §3.7).
- No 2008/100-question version, no non-English languages.
- No FSRS (slide-based SM-2 only; FSRS noted as a future swap in §12).
- No typed-answer checking / NLP grading (self-grade only — §3.6).

**Success = I can:** open the URL on my phone, "Add to Home Screen," study, close the app, reopen later (next day or whenever), and resume the queue exactly where it left off — worst-known cards first — all offline.

---

## 2. Architecture summary

- **Type:** static PWA. No build step, no bundler, no framework. **Vanilla JS (ES modules) + HTML + CSS.**
- **Persistence:** `localStorage`, single JSON blob (schedule state for ≤128 cards is far under the ~5 MB quota; sync API keeps code simple). IndexedDB is unnecessary at this scale.
- **Hosting:** GitHub Pages, served from repo root of `main`, **public repo** (Pages on private repos needs a paid plan; the content is public-domain USCIS material, so public is fine).
- **Offline:** service worker precaches the app shell + question JSON (cache-first).
- **Cards:** sourced from `data/citizenship_2025_newhaven.json` (provided; schema in §5).

Rationale for "no build step": Pages serves files as-is, relative paths just work, and there is no CI/transpile/deploy action to maintain. A bundler (Vite) buys module ergonomics we don't need for ~6 files and costs a `gh-pages` build/deploy workflow. See §10 alternative if this is ever revisited.

---

## 3. Locked design decisions

### 3.1 Card direction
Question → answer only. No reverse cards. The real test is oral recall of the answer given the question.

### 3.2 Grading UI: 4 buttons → SM-2 quality `q`
| Button | `q` | Meaning |
|---|---|---|
| Again | 0 | failed recall |
| Hard  | 3 | recalled with serious difficulty (min passing) |
| Good  | 4 | recalled correctly |
| Easy  | 5 | recalled effortlessly |

This mapping makes the math behave: Good (`q=4`) leaves EF ~unchanged, Easy (`q=5`) raises it, Hard (`q=3`) lowers it, Again is a lapse. Effects are expressed in **slides** (cards shown), not days — see §3.3. Each button previews its resulting gap (e.g. "≈ 12 slides").

### 3.3 Slide-based SM-2 (continuous scheduling)
SM-2's math, retimed from calendar **days** to **slides** (one "slide" = one card shown and graded). There is no calendar, clock, timezone, or midnight. Full design + rationale: `docs/superpowers/specs/2026-05-24-slide-based-sm2-scheduling-design.md`.

**Global clock:** a single integer `slidesSeen`, incremented by 1 every time a card is shown and graded.

Per-card state: `ef` (ease factor, init **2.5**), `interval` (gap in **slides**), `reps` (consecutive successes), `dueSlide` (the `slidesSeen` value at which the card becomes due), plus bookkeeping `lapses`, `lastSeenSlide`.

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

The **caller** (not the pure module) then sets `dueSlide = slidesSeen + jitter(interval)`, where `jitter(x) = max(1, round(x * (0.85 + random()*0.30)))` (±15%), increments `slidesSeen`, and records `lastSeenSlide`.

Notes for the implementer:
- A card is **due** when `dueSlide <= slidesSeen`; the next card is always the one with the smallest `dueSlide` (see §3.5).
- Worked example (all Good, `ef` 2.5): intervals `5 → 12 → 30 → 75 → 188 → 400 (capped from 470) → 400 …` — a mastered card resurfaces ~once per 400 slides.
- Keep `sm2.js` a standalone, **pure** module exporting `schedule(state, q) -> newState` that returns exactly `{ef, interval, reps, lapses}` in slides — **no DOM, no storage, no dates, no jitter, no global counter** (jitter and `dueSlide` are the caller's job, §3.5). It must be unit-testable in Node (§9).

### 3.4 Lapse behavior (native same-session relearn)
A lapse (**Again**, `q < 3`) resets the card to `interval = LAPSE_GAP` (3 slides) and `reps = 0`, so `dueSlide = slidesSeen + ~3`. The card therefore reappears within a few slides automatically. The old `relearnInSession` toggle is **removed** — same-session relearn is now intrinsic to the slide model. Tune `LAPSE_GAP` (§3.3) if "a few slides" should be sooner or later.

### 3.5 Continuous selection (no daily queue, no new-card drip)
All 128 cards are **live from the first slide** — there is no "new cards introduced today" logic and no daily caps. At first init, every card gets a stored record (`ef 2.5, reps 0, interval 0`) with `dueSlide` seeded from a **one-time random shuffle** of `0..127`, so the first pass through the deck is shuffled and a card missed during it re-appears within it.

Each step:
1. Pick the card with the smallest `dueSlide` (most overdue); tie-break by `id`. Because each `dueSlide` was assigned with ±15% jitter (§3.3), the order is non-rigid, not perfectly periodic — selection itself adds no randomness.
2. Show it; user self-grades (§3.6).
3. Update state via `sm2.js`; set `dueSlide = slidesSeen + jitter(interval)`; `slidesSeen += 1`; record `lastSeenSlide`.

There is **no "due today" gate and no "all done for today" screen** — study is one continuous stream; there is always a next card (the soonest-due). When everything is well-learned the next card's gap is simply large; surface that as a soft "caught up / mastery" stat (§7), not a blocking empty state.

### 3.6 Self-grading, not answer-matching
Show the question; on tap/space reveal **all** acceptable answers; user self-assesses and presses a grade button. For "name one…" the user needs only one; for `answerCount > 1` the UI displays the required count ("name 2") and reveals all valid options. No free-text checking (brittle for open answers; over-engineering for a personal app).

### 3.7 Cross-device state: none (manual transfer only)
Each device keeps its own `localStorage` schedule. Provide **Export** (download `srs_state.json`) and **Import** (file picker, replace state) in Settings. No gist/Drive sync (future, §12).

### 3.8 Dynamic / officeholder cards
8 cards (ids `23, 29, 30, 38, 39, 57, 61, 62`) carry `"dynamic": true` and `"verifyBeforeInterview": true`. Behavior:
- Scheduled and graded like any other card (do **not** exclude from the queue).
- Render a small **"verify before interview"** badge and a one-line note linking `https://www.uscis.gov/citizenship/testupdates`.
- Their answers are hardcoded in the JSON (verified 2026-05-24, New Haven/CT-3). Updating = edit JSON, redeploy.

### 3.9 Preferred ("best") answers
Each question carries `preferredAnswers` — a subset of `answers` (exact string matches) marking the easiest answer(s) to memorize: one for single-answer questions, or **`answerCount + 1`** for multi-answer questions (the required number plus one backup). Picks favor, in order: **reuse** (an answer that is also the best of other questions — e.g. "The President (of the United States)" covers Q42–45), then **familiarity/recognizability**, then **brevity**. Full curated list and rationale: `docs/superpowers/specs/2026-05-24-preferred-answers-design.md`.

Display (Study view): on reveal, render `preferredAnswers` first and **bold**; show the remaining answers under a muted "Other acceptable answers" line. Setting `showPreferredOnly` (default **false**) hides the non-preferred answers entirely. Highlighting is display-only — it never affects grading or scheduling.

---

## 4. Repository layout

```
citizenship-srs/                 # repo root = Pages publish dir
├── index.html                   # app shell; registers SW; loads ES modules
├── styles.css
├── src/
│   ├── app.js                   # bootstrap, session orchestration, routing
│   ├── sm2.js                   # PURE scheduling fn (unit-tested)
│   ├── store.js                 # localStorage load/save, export/import, daily counters
│   ├── queue.js                 # continuous selection (smallest dueSlide), init shuffle, jitter, slidesSeen
│   └── ui.js                    # render card, reveal, grade buttons, stats, settings
├── data/
│   └── citizenship_2025_newhaven.json   # provided; card source of truth
├── icons/
│   ├── icon-192.png             # TODO (§8.4)
│   └── icon-512.png             # TODO (§8.4)
├── manifest.webmanifest
├── service-worker.js
├── tests/
│   ├── sm2.test.mjs             # node --test, no deps
│   ├── preferred_answers.test.mjs  # validates preferredAnswers (node --test)
│   └── clusters.test.mjs        # validates tools/clusters.json against the deck (node --test)
├── tools/
│   ├── preferred_answers.json   # id → preferred-answers map (source of §3.9 picks)
│   ├── apply_preferred.mjs      # one-shot: writes preferredAnswers into the deck JSON
│   └── clusters.json            # reuse/relationship data (display-only; see §12)
├── docs/superpowers/specs/      # design specs (e.g. preferred answers)
├── README.md                    # deploy + usage (write during M6)
└── PLAN.md                      # this file
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

Counts to assert at load (sanity check, fail loud if wrong):
- 128 questions, ids contiguous 1..128.
- Exactly 8 with `dynamic: true` (ids 23,29,30,38,39,57,61,62), all non-empty `answers`.
- 20 with `seniorExemption: true`.
- 7 categories.
- Every question has `preferredAnswers`; each entry exactly matches one of its `answers`; length is 1 when `answerCount == 1`, else `answerCount + 1`.

**Provenance caveat (carry into README):** question text is from a public-domain GitHub mirror of USCIS **M-1778 (09/25)**, cross-checked for the 2025-specific answer changes (Q31/Q41/Q68/Q97) and integrity. Officeholders were independently web-verified on **2026-05-24**. Re-verify dynamic answers near any real interview date.

---

## 6. SRS state schema (localStorage)

Key: `citizenship_srs_v1`. Value (JSON):
```jsonc
{
  "version": 2,
  "slidesSeen": 137,
  "cards": {
    "38": { "ef": 2.5, "interval": 30, "reps": 3, "dueSlide": 165,
            "lapses": 0, "lastSeenSlide": 135 }
    // ALL 128 cards present from first init (seeded via a one-time shuffle)
  },
  "settings": { "maxGap": 400, "showPreferredOnly": false }
}
```
- Every card has a record from first init (the old "absent ⇒ new" rule is gone); a card is **due** when `dueSlide <= slidesSeen`.
- Removed vs. the day-based schema: the `daily` block, `newPerDay`, `maxReviewsPerDay`, `relearnInSession`, and per-card `due`/`lastReviewed`.
- Migrate on `version` bump (now **2**); never silently drop user state.

---

## 7. UI / screens

Single-page, three views toggled by a bottom nav (thumb-reachable on phone):

1. **Study** (default)
   - Header: continuous stats — `Slides: n · Mastered: n/128 · Weak: n` (no daily counters). "Mastered" = cards at/near `MAX_GAP`; "Weak" = cards with low `interval`/recent lapses.
   - Card: category chip; question text large; dynamic badge if applicable.
   - "Show answer" (tap card / Space) → reveals answer list; for `answerCount>1` show "Name N".
   - On reveal, `preferredAnswers` render first and **bold** ("memorize these"); remaining answers show under a muted "Other acceptable answers" line (hidden when `settings.showPreferredOnly`).
   - Grade row: **Again / Hard / Good / Easy** (keys 1–4). Each shows its next-gap preview (e.g., "≈ 12 slides") computed via a `sm2.js` dry-run, with jitter excluded so the preview is stable.
   - No empty state — study is continuous (§3.5). Optionally show a soft "You're caught up — nothing's pressing" note when the smallest `dueSlide` is far ahead of `slidesSeen`.
2. **Browse**
   - Filter by category / dynamic / senior-exemption; search box.
   - Tap a card to see Q + answers + its schedule state (ease, interval in slides, `dueSlide`, lapses). Read-only.
3. **Settings**
   - `maxGap` (how rarely mastered cards return; default 400), `showPreferredOnly`.
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
- Precache: `./`, `index.html`, `styles.css`, `src/*.js`, `manifest.webmanifest`, `data/citizenship_2025_newhaven.json`, `icons/*`.
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
- Purity: `schedule()` output keys are exactly `ef, interval, reps, lapses` — no date, no `dueSlide`, no jitter.

**Data (`tests/preferred_answers.test.mjs`), `node --test`, no deps.** Assert every question has `preferredAnswers`; each entry exactly matches an element of `answers`; length is 1 when `answerCount == 1`, else `answerCount + 1`; no duplicates within a question.

**Clusters (`tests/clusters.test.mjs`), `node --test`, no deps.** Assert each `sameAnswer` cluster's `answer` is present in every listed question's `preferredAnswers` (keeps the reuse data honest if a pick changes); all `thematic`/`confusionPairs` ids are valid (1..128), ≥2 per group, no dupes. (On this Node, run test files by path — `node --test tests/*.test.mjs` — the bare-directory form is unsupported.)

**Manual acceptance checklist:**
- [ ] Loads offline after first visit (DevTools → Offline, reload works).
- [ ] Installable on Android (install prompt appears; launches standalone).
- [ ] Grade a card → reload → schedule persisted (`slidesSeen`, `dueSlide` correct).
- [ ] All 128 cards are live from first run (no new-card drip); the first pass is shuffled.
- [ ] Again resets the card and it reappears within ~3 slides (native relearn, §3.4).
- [ ] A mastered card (interval at `MAX_GAP`) still recirculates within ~`MAX_GAP` slides.
- [ ] Dynamic cards show verify badge + correct New Haven answers (Trump, Vance, Johnson, Roberts, Lamont, Murphy/Blumenthal, DeLauro, Hartford).
- [ ] Export → Reset → Import round-trips state exactly.
- [ ] Load-time sanity assertions (§5) pass; corrupt/old state migrates, not crashes.
- [ ] Reveal shows bold preferred answer(s) first; "Other acceptable answers" lists the rest; `showPreferredOnly` hides them.

---

## 10. Deploy to GitHub Pages

1. Create **public** repo `citizenship-srs`; push all files to `main`.
2. **Settings → Pages → Build and deployment → Source: "Deploy from a branch" → Branch: `main` / `/ (root)` → Save.**
3. Wait for the green check; site at `https://<USERNAME>.github.io/citizenship-srs/`.
4. Open on desktop to verify; then on Android Chrome → ⋮ → **Install app / Add to Home Screen**.
5. **Updating:** edit → commit → push; **bump the SW cache version** (`civics-vN`) so clients refresh. With `skipWaiting()`+`clients.claim()`, one reload after the SW updates picks up changes (occasionally two).

Alternative (only if §2 "no build step" is ever reversed): Vite + a `gh-pages` GitHub Action publishing `dist/` to a `gh-pages` branch, with `base: "/citizenship-srs/"` set in `vite.config`. Not recommended for this scope.

---

## 11. Open questions (decide before/while building)

1. **Daily volume:** ~~`newPerDay` / `maxReviewsPerDay`~~ — **removed.** Slide-based scheduling has no daily caps or new-card drip (§3.5). The analogous dial is now `MAX_GAP` (how rarely mastered cards return; default 400, exposed as `settings.maxGap`); revisit it (300–600) after real use.
2. **Hard button:** keep pure SM-2 (Hard = normal growth with EF penalty) or add Anki-style Hard = `interval × 1.2`? Default: pure SM-2.
3. **Again:** **Resolved** — native same-session re-show via `LAPSE_GAP` (3 slides); see §3.4.
4. **Leeches:** flag cards with `lapses ≥ 8` for attention? (Default: no, just track `lapses`.)
5. **Sync:** confirm manual export/import is enough, or do you want a later gist/Drive sync milestone?
6. **Oral practice:** add Web Speech `SpeechSynthesis` to read the question aloud (the real test is oral)? Default: defer to §12.
7. **Senior 65/20 mode:** ✅ **Decided (2026-05-24): include.** Add a Study/Browse filter to drill only the 20 `seniorExemption` cards (the asterisked set). Data already supports it; it's a cheap filter, no scheduling change. (Note: 20 cards carry the flag; the 65/20 interview *asks* 10, pass at 6 — see `meta.interview_rules`.)
8. **Repo name / username** for the Pages URL and manifest `name`.
9. **Icons:** generate a placeholder now or supply your own?

---

## 12. Future extensions (explicitly deferred)

- **TTS oral mode** (SpeechSynthesis) for question read-aloud.
- **FSRS swap:** replace `sm2.js` with the `ts-fsrs` package behind the same `schedule()` interface; add a `desiredRetention` setting. State schema would gain `stability`/`difficulty`. Caveat: FSRS is time-based, so adopting it would reintroduce a real-time clock and reverse the §3.3 slide model — a deliberate trade, not a drop-in.
- **Stats:** review heatmap, retention %, due-forecast.
- **2008/100-question deck** as a selectable second deck (the JSON schema already generalizes).
- **Sync** via GitHub Gist (token) or Google Drive appData.
- **Mock-test mode (self-graded):** serve 20 random questions (or 10 from the `seniorExemption` set), self-grade each, report ≥12/20 (≥6/10) as a pass. Compatible with §3.6 (no answer-matching — the user still self-grades); a useful exam-readiness gauge separate from the SRS queue.
- **Reuse-cluster study + display aid:** data lives in `tools/clusters.json` (`sameAnswer` / `thematic` / `confusionPairs`, mined from `external_civics_test_128_app_data.md`, validated by `tests/clusters.test.mjs`). Cheap display-only win: on reveal, when a preferred answer is a `sameAnswer` cluster, show "Same answer as Q…". A full "learn one cluster per session" study mode is deferred (it cross-cuts the per-card SM-2 queue in §3.5).
- **Confusion hints (display-only):** optional muted "Don't confuse with…" line on reveal, sourced from `clusters.json` `confusionPairs` (e.g. Memorial vs Veterans Day; 14th/15th/19th). Never affects grading or scheduling. (The external dataset's `keywords`/`common_wrong` fuzzy-grading idea is **rejected** — it conflicts with the locked self-grade decision §3.6.)

---

## 13. Suggested Claude Code milestone order

Build in vertical slices; each milestone should end green and committable.

- **M0 — Pipeline:** repo + minimal `index.html` ("hello") deployed to Pages; confirm the relative-path/base-URL behavior on the live URL. *Accept:* live page loads.
- **M1 — Render:** load JSON (with §5 assertions), show one card, reveal answers, render 4 grade buttons (no persistence, no scheduling). *Accept:* can flip through cards.
- **M2 — Engine:** `sm2.js` + `tests/sm2.test.mjs` passing under `node --test`. *Accept:* all §9 unit assertions pass.
- **M3 — Persistence & queue:** `store.js` + `queue.js`; grading updates state, smallest-`dueSlide` selection, one-time init shuffle, ±15% jitter, `slidesSeen` counter. (No daily caps, no midnight reset, no relearn toggle — relearn is native, §3.4.) *Accept:* §9 manual persistence/queue items pass.
- **M4 — PWA:** `manifest.webmanifest` + `service-worker.js`; offline + installable. *Accept:* offline reload + Android install work.
- **M5 — Polish:** Browse + Settings views, dynamic badges + testupdates note, export/import/reset, dark mode, next-interval previews on buttons. *Accept:* remaining checklist items.
- **M6 — Finish:** icons, `README.md` (deploy + usage + provenance), final acceptance pass, tag `v1.0`.

**Conventions for the build:** vanilla ES modules, no framework, no build step, all paths relative, `sm2.js` stays pure/side-effect-free and **date-free** (slides only; jitter + `dueSlide` live in `queue.js`), fail loud on bad data, never silently drop saved state on migration.
