/**
 * Date and value scales shared by the line and bar charts. Pure functions,
 * kept free of React Native so they can be tested with `node --test`.
 *
 * The X axis is measured in whole days: a range from `from` to `to` (both
 * YYYY-MM-DD, inclusive) covers the days [day(from), day(to) + 1), and a
 * point dated `d` sits in the middle of its day. A range of a single day is
 * still one day wide, so a lone point is centred instead of hugging an edge.
 */

const DAY_MS = 86_400_000;

/** Days since 1970-01-01 for a YYYY-MM-DD date, free of timezone and DST shifts. */
export function dayNumber(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

/** The YYYY-MM-DD date `days` after `date`. */
export function addDays(date: string, days: number) {
  return new Date((dayNumber(date) + days) * DAY_MS).toISOString().slice(0, 10);
}

/** The Monday starting the week of a YYYY-MM-DD date. */
export function mondayOf(date: string) {
  // 1970-01-01 was a Thursday, so day 0 is 3 days after a Monday.
  return addDays(date, -((dayNumber(date) + 3) % 7));
}

/** Maps the days from `from` to `to` (inclusive) across `width` pixels starting at `left`. */
export function xScale(from: string, to: string, left: number, width: number) {
  const start = dayNumber(from);
  const days = Math.max(dayNumber(to) - start + 1, 1);
  const pxPerDay = width / days;
  return {
    /** X of the left edge of day `d` plus `offset` days. */
    at: (date: string, offset = 0) => left + (dayNumber(date) - start + offset) * pxPerDay,
    /** X of the middle of a date's day, where its point sits. */
    point: (date: string) => left + (dayNumber(date) - start + 0.5) * pxPerDay,
    pxPerDay,
  };
}

/** A round step (1, 2, 2.5 or 5 × 10^n) giving about `count` intervals over `span`. */
export function niceStep(span: number, count: number) {
  const raw = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].find((m) => m * magnitude >= raw * (1 - 1e-9))! * magnitude;
}

/**
 * Y axis bounds and gridline values for `values`, on round numbers. With
 * `zeroBased` the axis starts at zero, for totals that a cropped axis would
 * misrepresent; otherwise it fits the data, centring a flat series.
 */
export function yScale(values: number[], zeroBased: boolean) {
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (zeroBased) {
    lo = Math.min(lo, 0);
    hi = Math.max(hi, 0);
  }
  if (hi === lo) {
    const pad = Math.max(Math.abs(hi) * 0.05, 0.5);
    if (!zeroBased || hi === 0) hi += pad;
    if (!zeroBased) lo -= pad;
  }
  const step = niceStep(hi - lo, 4);
  // Snap away float noise (e.g. 10.600000000000001) before rounding outwards.
  const snap = (v: number) => Math.round((v / step) * 1e6) / 1e6;
  const min = Math.floor(snap(lo)) * step;
  const max = Math.max(Math.ceil(snap(hi)) * step, min + step);
  const ticks: number[] = [];
  for (let i = 0; min + i * step <= max + step / 2; i++) ticks.push(+(min + i * step).toPrecision(12));
  return { min, max, ticks };
}
