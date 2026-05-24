export const FIRST = 5;
export const SECOND = 12;
export const LAPSE_GAP = 3;
export const MAX_GAP = 400;
export const EF_INIT = 2.5;
export const EF_MIN = 1.3;
export const HARD_FACTOR = 0.8;
export const EASY_FACTOR = 1.4;

// Pure. Returns { ef, interval, reps, lapses } in slides. No dueSlide/jitter/counters/dates.
export function schedule(state, q, maxGap = MAX_GAP) {
  let { ef, interval, reps, lapses } = state;
  if (q >= 3) {
    if (reps === 0) interval = FIRST;
    else if (reps === 1) interval = SECOND;
    else interval = Math.round(interval * ef);
    // Anki-style spread: Hard shortens, Easy lengthens; Good (q=4) unchanged.
    if (q === 3) interval = Math.max(1, Math.round(interval * HARD_FACTOR));
    else if (q === 5) interval = Math.round(interval * EASY_FACTOR);
    reps += 1;
    ef = ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    if (ef < EF_MIN) ef = EF_MIN;
    if (interval > maxGap) interval = maxGap;
  } else {
    reps = 0;
    interval = LAPSE_GAP;
    lapses += 1;
    // ef intentionally unchanged on lapse (original SM-2)
  }
  return { ef, interval, reps, lapses };
}
