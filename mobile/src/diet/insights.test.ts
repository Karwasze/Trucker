import type { DietInsights } from '@/api/types';
import { dietInsights } from '@/diet/insights';

const none: DietInsights = {
  current_streak: 0,
  longest_streak: 0,
  recent: { days: 30, logged: 0, adhered: 0 },
};

test('says nothing before anything is logged', () => {
  expect(dietInsights(none)).toEqual([]);
});

test('sums up streaks, adherence, slips, protein and bodyweight', () => {
  expect(
    dietInsights({
      current_streak: 5,
      longest_streak: 12,
      recent: { days: 30, logged: 26, adhered: 24 },
      most_missed: { weekday: 'saturday', missed: 3, logged: 4 },
      protein: { window: 14, days: 9, average_g: 143.3 },
      bodyweight: { from: '2026-09-25', to: '2026-10-19', change_kg: -1.1 },
    })
  ).toEqual([
    { title: '5-day streak', body: 'Your best is 12 days.' },
    { title: 'Kept to 24 of 26 days logged', body: '92% over the last 30 days, with 4 days not logged.' },
    { title: 'Saturdays slip most', body: 'Missed 3 of the last 4 Saturdays logged. Worth planning ahead for.' },
    { title: 'Averaging 143.3 g of protein', body: 'Over 9 days counted in the last 14 days.' },
    { title: 'Down 1.1 kg', body: 'Since 25 Sept, keeping to your diet 92% of days.' },
  ]);
});

test('marks a streak that is the longest, and one that ended', () => {
  expect(dietInsights({ ...none, current_streak: 3, longest_streak: 3 })[0]).toEqual({
    title: '3-day streak',
    body: 'Your longest yet.',
  });
  expect(dietInsights({ ...none, longest_streak: 1 })[0]).toEqual({
    title: 'No streak going',
    body: 'Your best is 1 day. Keep to it today to start a new one.',
  });
});

test('counts protein over a single day', () => {
  const [line] = dietInsights({ ...none, protein: { window: 14, days: 1, average_g: 150 } });
  expect(line).toEqual({ title: 'Averaging 150 g of protein', body: 'Over 1 day counted in the last 14 days.' });
});
