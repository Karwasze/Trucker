import { personalRecords } from '@/progress/records';

const session = (date: string, estimated_1rm: number) => ({ date, estimated_1rm, total_volume: 0 });

test('a PR is a session beating every earlier one, newest first, with the gain over the record before', () => {
  const data = [
    session('2026-01-05', 100),
    session('2026-02-01', 95),
    session('2026-03-01', 105),
    session('2026-04-01', 105),
    session('2026-05-01', 112.5),
  ];
  expect(personalRecords(data)).toEqual([
    { date: '2026-05-01', estimated_1rm: 112.5, gain: 7.5 },
    { date: '2026-03-01', estimated_1rm: 105, gain: 5 },
  ]);
});

test('the first session ever only sets a baseline', () => {
  expect(personalRecords([session('2026-01-05', 100)])).toEqual([]);
  expect(personalRecords([])).toEqual([]);
});
