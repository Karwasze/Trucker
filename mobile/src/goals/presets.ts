import type { NewGoal } from '@/api/types';

/** Common races, as the legs they cover in metres. */
export const GOAL_PRESETS: { label: string; legs: Pick<NewGoal, 'swim_m' | 'bike_m' | 'run_m'> }[] = [
  { label: 'Marathon', legs: { run_m: 42195 } },
  { label: 'Half triathlon', legs: { swim_m: 1900, bike_m: 90000, run_m: 21097 } },
  { label: 'Ironman triathlon', legs: { swim_m: 3800, bike_m: 180000, run_m: 42195 } },
  { label: '45 km ride', legs: { bike_m: 45000 } },
];

export const PHASE_NAMES = {
  base: 'Base',
  build: 'Build',
  peak: 'Peak',
  taper: 'Taper',
  race: 'Race week',
} as const;
