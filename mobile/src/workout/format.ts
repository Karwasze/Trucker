import type { Exercise } from '@/api/types';

export function formatDate(date: string, options?: Intl.DateTimeFormatOptions) {
  // Noon avoids the date shifting across timezones.
  return new Date(`${date}T12:00:00`).toLocaleDateString(
    undefined,
    options ?? { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }
  );
}

export const volumeOf = (exercises: Exercise[]) =>
  exercises.reduce((sum, e) => sum + e.sets.reduce((s, set) => s + set.reps * set.weight, 0), 0);

export const formatKg = (kg: number) => `${Math.round(kg).toLocaleString()} kg`;
