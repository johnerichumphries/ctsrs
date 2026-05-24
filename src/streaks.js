// Pure, DOM-free streak tracking for the hippo reward overlay (PLAN §3.11 /
// docs/superpowers/specs/2026-05-24-hippo-streak-rewards-design.md).
// No DOM, no storage, no timers, no globals — like sm2.js. Returns a fresh
// object; never mutates its input.

export const HAPPY = [5, 10, 15, 25]; // correct-streak thresholds -> hippohappy_N.png
export const SAD = [3, 6, 9, 12, 20]; // wrong-streak thresholds  -> hipposad_N.png

// streaks: { correctStreak, wrongStreak }; q: SM-2 grade quality.
// Returns { correctStreak, wrongStreak, fired } where fired is null or
// { kind: 'happy'|'sad', n }. Fire only on the step a counter increments, so a
// Hard taken while sitting on a threshold does not re-fire.
export function nextStreak(streaks, q) {
  let { correctStreak, wrongStreak } = streaks;
  let fired = null;
  if (q >= 4) {                 // Good / Easy / Right
    correctStreak += 1;
    wrongStreak = 0;
    if (HAPPY.includes(correctStreak)) fired = { kind: 'happy', n: correctStreak };
  } else if (q === 3) {         // Hard: neutral for happy; still a pass, ends a wrong run
    wrongStreak = 0;
  } else {                      // Again / Wrong (q < 3)
    wrongStreak += 1;
    correctStreak = 0;
    if (SAD.includes(wrongStreak)) fired = { kind: 'sad', n: wrongStreak };
  }
  return { correctStreak, wrongStreak, fired };
}
