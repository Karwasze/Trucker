import type { CardioLap, CardioSample } from '@/api/types';

/** Seconds between the points of a workout's sample series. */
export const BUCKET_SECONDS = 10;

/** A reading over [start, end], in milliseconds since the epoch. */
export type Reading = { start: number; end: number; value: number };

/**
 * Turns a workout's distance readings (metres covered over each reading's
 * interval) and heart-rate readings (bpm) into a series every BUCKET_SECONDS
 * from `start` to `end`: the distance covered so far and the average heart
 * rate measured in the preceding bucket. A distance reading spanning
 * several buckets is spread over them evenly.
 */
export function bucketSamples(
  start: number,
  end: number,
  distances: Reading[],
  heartRates: Reading[]
): CardioSample[] {
  const bucketMs = BUCKET_SECONDS * 1000;
  const count = Math.max(1, Math.ceil((end - start) / bucketMs));
  const covered = new Array<number>(count).fill(0);
  for (const r of distances) {
    const from = Math.max(r.start, start);
    const to = Math.min(Math.max(r.end, r.start), end);
    if (to < from) continue;
    if (to === from) {
      covered[Math.min(count - 1, Math.floor((from - start) / bucketMs))] += r.value;
      continue;
    }
    for (let i = Math.floor((from - start) / bucketMs); i < count; i++) {
      const bucketStart = start + i * bucketMs;
      if (bucketStart >= to) break;
      const overlap = Math.min(to, bucketStart + bucketMs) - Math.max(from, bucketStart);
      if (overlap > 0) covered[i] += (r.value * overlap) / (to - from);
    }
  }

  const hrSum = new Array<number>(count).fill(0);
  const hrCount = new Array<number>(count).fill(0);
  for (const r of heartRates) {
    const i = Math.floor((r.start - start) / bucketMs);
    if (i < 0 || i >= count) continue;
    hrSum[i] += r.value;
    hrCount[i]++;
  }

  const samples: CardioSample[] = [{ t: 0, d: 0 }];
  let total = 0;
  for (let i = 0; i < count; i++) {
    total += covered[i];
    const sample: CardioSample = { t: (i + 1) * BUCKET_SECONDS, d: Math.round(total * 10) / 10 };
    if (hrCount[i] > 0) sample.hr = Math.round(hrSum[i] / hrCount[i]);
    samples.push(sample);
  }
  return samples;
}

/** The distance covered `t` seconds in, interpolated between samples. */
export function distanceAt(samples: CardioSample[], t: number): number {
  if (samples.length === 0) return 0;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    if (t <= b.t) return a.d + ((b.d - a.d) * Math.max(0, t - a.t)) / (b.t - a.t || 1);
  }
  return samples[samples.length - 1].d;
}

/** Laps from events over [start, end] ms since the epoch, with the distance each covered. */
export function lapsFrom(
  start: number,
  events: { start: number; end: number }[],
  samples: CardioSample[]
): CardioLap[] {
  return events.map((e) => {
    const t = (e.start - start) / 1000;
    const duration = (e.end - e.start) / 1000;
    const d = distanceAt(samples, t + duration) - distanceAt(samples, t);
    return { t: Math.round(t * 10) / 10, duration: Math.round(duration * 10) / 10, d: Math.round(d * 10) / 10 };
  });
}
