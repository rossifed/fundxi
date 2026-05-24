/* Return calculations — pure domain functions.
 *
 * DDD role: Value-Object–shaped helpers. Zero I/O, deterministic.
 * Used everywhere the UI shows a "% change" so the formula lives in a
 * single place. Guards against divide-by-zero by returning 0 instead
 * of NaN/Infinity (UI then renders "+0.0%" — a sensible default for
 * an unset baseline). */

/** Percentage change from a base value to a current value.
 * Returns 0 when ``base`` is 0 (no meaningful baseline). */
export function compute_return_pct(current: number, base: number): number {
  if (base === 0) return 0;
  return ((current - base) / base) * 100;
}

/** Percentage change between the first and the last point of a value
 * history. Returns 0 when the history has < 2 points or its first
 * value is 0. */
export function compute_period_return(history: readonly number[]): number {
  if (history.length < 2) return 0;
  const first = history[0]!;
  const last = history[history.length - 1]!;
  return compute_return_pct(last, first);
}
