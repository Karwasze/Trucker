import { upcomingWeek } from '@/workout/week';

test('a weekday gives this week, Monday to Sunday', () => {
  expect(upcomingWeek('2026-10-14')).toEqual([
    '2026-10-12',
    '2026-10-13',
    '2026-10-14',
    '2026-10-15',
    '2026-10-16',
    '2026-10-17',
    '2026-10-18',
  ]);
  expect(upcomingWeek('2026-10-12')[0]).toBe('2026-10-12');
  expect(upcomingWeek('2026-10-17')[0]).toBe('2026-10-12');
});

test('on Sunday it gives next week', () => {
  expect(upcomingWeek('2026-10-18')).toEqual([
    '2026-10-19',
    '2026-10-20',
    '2026-10-21',
    '2026-10-22',
    '2026-10-23',
    '2026-10-24',
    '2026-10-25',
  ]);
});

test('weeks run across month ends and the DST change', () => {
  expect(upcomingWeek('2026-10-25')).toEqual([
    '2026-10-26',
    '2026-10-27',
    '2026-10-28',
    '2026-10-29',
    '2026-10-30',
    '2026-10-31',
    '2026-11-01',
  ]);
  expect(upcomingWeek('2026-03-31')[6]).toBe('2026-04-05');
});
