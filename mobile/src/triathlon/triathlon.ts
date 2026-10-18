import type { CardioActivity, Triathlon, TriathlonClass, TriathlonLeg, TriathlonLegKey } from '@/api/types';

export const TRIATHLON_CLASS_NAMES: Record<TriathlonClass, string> = {
  sprint: 'Sprint',
  quarter: 'Quarter',
  half: 'Half',
  full: 'Full',
  custom: 'Custom distance',
};

/** Classes shortest first, custom distances last. */
export const TRIATHLON_CLASSES: TriathlonClass[] = ['sprint', 'quarter', 'half', 'full', 'custom'];

/** The legs in race order, with the activity each is. */
export const TRIATHLON_LEGS: { key: TriathlonLegKey; activity: CardioActivity }[] = [
  { key: 'swim', activity: 'swimming' },
  { key: 'bike', activity: 'cycling' },
  { key: 'run', activity: 'running' },
];

/** A leg's speed in m/s, or undefined without a distance. */
export const legSpeed = (leg: TriathlonLeg) =>
  leg.distance_m > 0 && leg.duration_seconds > 0 ? leg.distance_m / leg.duration_seconds : undefined;

/** "Quarter triathlon", or "Triathlon" for custom distances. */
export const triathlonName = (t: Triathlon) =>
  t.class === 'custom' ? 'Triathlon' : `${TRIATHLON_CLASS_NAMES[t.class]} triathlon`;

/** The fastest of `t`'s class among `all`, or undefined for custom distances. */
export function classRecord(t: Triathlon, all: Triathlon[]): Triathlon | undefined {
  if (t.class === 'custom') return undefined;
  return all
    .filter((o) => o.class === t.class)
    .reduce<Triathlon | undefined>((best, o) => (!best || o.total_seconds < best.total_seconds ? o : best), undefined);
}

/** The percentage `share` (0–1) as a whole number, e.g. "38%". */
export const percent = (share: number) => `${Math.round(share * 100)}%`;
