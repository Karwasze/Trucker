import type { CardioSample, HeartRateZone } from '@/api/types';

/** The age-predicted max heart rate, 220 less the age on `today`. */
export function maxHeartRate(dateOfBirth: Date, today: Date): number {
  let age = today.getFullYear() - dateOfBirth.getFullYear();
  const birthday = new Date(today.getFullYear(), dateOfBirth.getMonth(), dateOfBirth.getDate());
  if (today < birthday) age--;
  return 220 - age;
}

/** A zone's range, e.g. "133–145 bpm", "< 133 bpm" or "172+ bpm". */
export function formatZoneRange(z: HeartRateZone): string {
  if (z.min === undefined) return `< ${(z.max ?? 0) + 1} bpm`;
  if (z.max === undefined) return `${z.min}+ bpm`;
  return `${z.min}–${z.max} bpm`;
}

/** The index in `zones` of the zone a heart rate is in. */
function zoneIndex(zones: HeartRateZone[], hr: number): number {
  const i = zones.findIndex((z) => z.max === undefined || Math.round(hr) <= z.max);
  return i < 0 ? zones.length - 1 : i;
}

/**
 * Seconds spent in each zone: each sample's heart rate counts for the time
 * since the sample before it, and a sample without one keeps the last
 * reading going. Time before the first reading counts for none.
 */
export function timeInZones(samples: CardioSample[], zones: HeartRateZone[]): number[] {
  const seconds = zones.map(() => 0);
  let hr: number | undefined;
  for (let i = 1; i < samples.length; i++) {
    hr = samples[i].hr ?? hr;
    if (hr !== undefined) seconds[zoneIndex(zones, hr)] += samples[i].t - samples[i - 1].t;
  }
  return seconds;
}
