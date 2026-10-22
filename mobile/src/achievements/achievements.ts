import type { Achievement, AchievementTier, CardioActivity } from '@/api/types';
import { formatDistance, formatDuration } from '@/workout/format';

/** Medals for the tiers of an achievement, easiest first; longer ladders end in a trophy. */
const MEDALS = ['🥉', '🥈', '🥇', '🏆'];
export const medal = (tier: number) => MEDALS[Math.min(tier, MEDALS.length - 1)];

export const CATEGORY_NAMES: Record<Achievement['category'], string> = {
  pace: 'Pace',
  distance: 'Distance',
  triathlon: 'Triathlon',
  strength: 'Strength',
};

/** A race distance, in whole km (or metres for swims) where it is one. */
function roundDistance(metres: number, activity?: string) {
  if (activity === 'swimming') return `${Math.round(metres).toLocaleString()} m`;
  return `${Number((metres / 1000).toFixed(1))} km`;
}

/** What a tier asks for, e.g. "Under 25:00", "10 km" or "Intermediate". */
export function tierLabel(a: Achievement, tier: AchievementTier) {
  if (tier.name) return tier.name;
  switch (a.category) {
    case 'pace':
      return `Under ${formatDuration(tier.target)}`;
    case 'distance':
      return roundDistance(tier.target, a.activity);
    default:
      return String(tier.target);
  }
}

/** More on what a tier asks for, where the label doesn't say it all. */
export function tierDetail(a: Achievement, tier: AchievementTier) {
  return a.category === 'strength' ? `${tier.target}× bodyweight` : undefined;
}

/** The best result so far, e.g. "Best 24:00", or undefined before any. */
export function bestLabel(a: Achievement) {
  if (a.best === undefined) return undefined;
  switch (a.category) {
    case 'pace':
      return `Best ${formatDuration(a.best)}`;
    case 'distance':
      return `Longest ${formatDistance(a.best, a.activity as CardioActivity)}`;
    case 'strength':
      return `Best ${a.best}× bodyweight`;
    default:
      return undefined;
  }
}

/** How many tiers are earned; easier tiers are always earned first. */
export const earnedCount = (a: Achievement) => a.tiers.filter((t) => t.earned_on).length;

/** Identifies an earned tier across loads, to tell which ones are new. */
export const tierKey = (a: Achievement, tier: number) => `${a.id}:${tier}`;

/** The keys of every earned tier. */
export const earnedKeys = (list: Achievement[]) =>
  list.flatMap((a) => a.tiers.flatMap((t, i) => (t.earned_on ? [tierKey(a, i)] : [])));

/** Where to see what earned a tier: the workout, or the triathlon day. */
export function tierHref(a: Achievement, tier: AchievementTier) {
  if (!tier.earned_on) return undefined;
  if (a.category === 'triathlon') {
    return { pathname: '/history/triathlon/[date]', params: { date: tier.earned_on } } as const;
  }
  if (!tier.workout_id) return undefined;
  return a.category === 'strength'
    ? ({ pathname: '/history/[id]', params: { id: tier.workout_id } } as const)
    : ({ pathname: '/history/cardio/[id]', params: { id: tier.workout_id } } as const);
}
