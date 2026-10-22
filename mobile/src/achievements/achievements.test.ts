import type { Achievement } from '@/api/types';

import { bestLabel, earnedKeys, medal, tierDetail, tierHref, tierLabel } from '@/achievements/achievements';

const fiveK: Achievement = {
  id: 'pace-running-5000',
  category: 'pace',
  title: '5 km run',
  activity: 'running',
  distance_m: 5000,
  best: 1440,
  tiers: [
    { target: 1800, earned_on: '2026-03-10', workout_id: 7 },
    { target: 1500, earned_on: '2026-03-10', workout_id: 7 },
    { target: 1200 },
  ],
};

describe('achievements', () => {
  it('labels tiers by what they ask for', () => {
    expect(fiveK.tiers.map((t) => tierLabel(fiveK, t))).toEqual(['Under 30:00', 'Under 25:00', 'Under 20:00']);
    const swim: Achievement = {
      id: 'distance-swimming',
      category: 'distance',
      title: 'Longest swim',
      activity: 'swimming',
      tiers: [{ target: 1500 }, { target: 3800, name: 'Ironman swim' }],
    };
    expect(swim.tiers.map((t) => tierLabel(swim, t))).toEqual(['1,500 m', 'Ironman swim']);
    const run: Achievement = { ...swim, activity: 'running', tiers: [{ target: 10000 }] };
    expect(tierLabel(run, run.tiers[0])).toBe('10 km');
  });

  it('describes strength tiers relative to bodyweight', () => {
    const squat: Achievement = {
      id: 'strength-squat',
      category: 'strength',
      title: 'Squat',
      best: 1.41,
      tiers: [{ name: 'Novice', target: 1.25 }],
    };
    expect(tierLabel(squat, squat.tiers[0])).toBe('Novice');
    expect(tierDetail(squat, squat.tiers[0])).toBe('1.25× bodyweight');
    expect(bestLabel(squat)).toBe('Best 1.41× bodyweight');
  });

  it('shows the best result', () => {
    expect(bestLabel(fiveK)).toBe('Best 24:00');
    expect(bestLabel({ ...fiveK, best: undefined })).toBeUndefined();
  });

  it('keys earned tiers only', () => {
    expect(earnedKeys([fiveK])).toEqual(['pace-running-5000:0', 'pace-running-5000:1']);
  });

  it('ends long ladders in a trophy', () => {
    expect([0, 1, 2, 3, 4].map(medal)).toEqual(['🥉', '🥈', '🥇', '🏆', '🏆']);
  });

  it('links earned tiers to what earned them', () => {
    expect(tierHref(fiveK, fiveK.tiers[0])).toEqual({ pathname: '/history/cardio/[id]', params: { id: 7 } });
    expect(tierHref(fiveK, fiveK.tiers[2])).toBeUndefined();
    const tri: Achievement = {
      id: 'triathlon',
      category: 'triathlon',
      title: 'Triathlon',
      tiers: [{ name: 'Sprint', target: 25750, earned_on: '2026-06-07' }],
    };
    expect(tierHref(tri, tri.tiers[0])).toEqual({
      pathname: '/history/triathlon/[date]',
      params: { date: '2026-06-07' },
    });
  });
});
