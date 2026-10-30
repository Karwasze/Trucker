import type { CardioActivity } from '@/api/types';

/**
 * What the Progress tab shows: the bodyweight log, one exercise's estimated
 * 1RM, one activity's cardio workouts, or triathlons.
 */
export type Series =
  | { kind: 'bodyweight' }
  | { kind: 'exercise'; name: string }
  | { kind: 'cardio'; activity: CardioActivity }
  | { kind: 'triathlon' };

/** The Progress tab's top carousel, in order: lifts, then cardio, then bodyweight. */
export type Category = 'strength' | 'cardio' | 'bodyweight';

export const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'strength', label: 'Strength' },
  { key: 'cardio', label: 'Cardio' },
  { key: 'bodyweight', label: 'Bodyweight' },
];

const CARDIO_NAMES: Record<CardioActivity, string> = {
  running: 'Running',
  cycling: 'Cycling',
  swimming: 'Swimming',
  walking: 'Walking',
  hiking: 'Hiking',
};

export const seriesLabel = (s: Series) =>
  s.kind === 'bodyweight'
    ? 'Bodyweight'
    : s.kind === 'triathlon'
      ? 'Triathlon'
      : s.kind === 'cardio'
        ? CARDIO_NAMES[s.activity]
        : s.name;

// Exercise names can't start with a colon, so these never clash.
export const seriesKey = (s: Series) =>
  s.kind === 'bodyweight' || s.kind === 'triathlon'
    ? `:${s.kind}`
    : s.kind === 'cardio'
      ? `:cardio:${s.activity}`
      : s.name;

export const categoryOf = (s: Series): Category =>
  s.kind === 'exercise' ? 'strength' : s.kind === 'bodyweight' ? 'bodyweight' : 'cardio';
