import type { CardioActivity, Exercise } from '@/api/types';

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

export const ACTIVITY_NAMES: Record<CardioActivity, string> = {
  running: 'Run',
  cycling: 'Ride',
  swimming: 'Swim',
  walking: 'Walk',
  hiking: 'Hike',
};

export const ACTIVITY_ICONS: Record<CardioActivity, string> = {
  running: '🏃',
  cycling: '🚴',
  swimming: '🏊',
  walking: '🚶',
  hiking: '🥾',
};

/** A duration as h:mm:ss, or m:ss under an hour. */
export function formatDuration(seconds: number) {
  const s = Math.round(seconds);
  const pad = (n: number) => String(n).padStart(2, '0');
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/** A distance in km, or in metres for swims. */
export function formatDistance(metres: number, activity?: CardioActivity) {
  if (activity === 'swimming') return `${Math.round(metres).toLocaleString()} m`;
  return `${(metres / 1000).toFixed(metres < 10000 ? 2 : 1)} km`;
}

/**
 * How fast, in the unit each sport uses: km/h for rides, time per 100 m for
 * swims and time per km otherwise. Empty without a distance.
 */
export function formatPace(activity: CardioActivity, metres: number | undefined, seconds: number) {
  if (!metres || seconds <= 0) return '';
  if (activity === 'cycling') return `${((metres / seconds) * 3.6).toFixed(1)} km/h`;
  if (activity === 'swimming') return `${formatDuration((seconds / metres) * 100)}/100 m`;
  return `${formatDuration((seconds / metres) * 1000)}/km`;
}

/** The time of day of an RFC3339 timestamp, in the device's time zone. */
export const formatTime = (timestamp: string) =>
  new Date(timestamp).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
