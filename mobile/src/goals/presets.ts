import type { NewGoal } from '@/api/types';

/** Common races, as the legs they cover in metres. */
export const GOAL_PRESETS: { label: string; legs: Pick<NewGoal, 'swim_m' | 'bike_m' | 'run_m'> }[] = [
  { label: '5k', legs: { run_m: 5000 } },
  { label: '10k', legs: { run_m: 10000 } },
  { label: 'Half marathon', legs: { run_m: 21097 } },
  { label: 'Marathon', legs: { run_m: 42195 } },
  { label: 'Sprint tri', legs: { swim_m: 750, bike_m: 20000, run_m: 5000 } },
  { label: '¼ tri', legs: { swim_m: 950, bike_m: 45000, run_m: 10550 } },
  { label: 'Olympic tri', legs: { swim_m: 1500, bike_m: 40000, run_m: 10000 } },
  { label: '45 km ride', legs: { bike_m: 45000 } },
];

export const PHASE_NAMES = {
  base: 'Base',
  build: 'Build',
  peak: 'Peak',
  taper: 'Taper',
  race: 'Race week',
} as const;
