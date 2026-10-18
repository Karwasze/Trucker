import type { Exercise } from '@/api/types';
import { formatDate, formatDistance, formatDuration, formatKg, formatPace, volumeOf } from '@/workout/format';

test('formatDate shows the calendar date regardless of time zone', () => {
  expect(formatDate('2026-10-12')).toBe('Mon, 12 Oct 2026');
  // The clocks go back that night; the date must not slip.
  expect(formatDate('2026-10-25', { day: 'numeric', month: 'short' })).toBe('25 Oct');
});

test('volumeOf sums weight × reps over every set', () => {
  const exercises: Exercise[] = [
    {
      name: 'Squat',
      sets: [
        { weight: 100, reps: 5 },
        { weight: 100, reps: 5 },
      ],
    },
    { name: 'Pull-up', sets: [{ weight: 0, reps: 10 }] },
  ];
  expect(volumeOf(exercises)).toBe(1000);
  expect(volumeOf([])).toBe(0);
});

test('formatKg rounds to whole kilograms', () => {
  expect(formatKg(1234.6)).toBe('1,235 kg');
});

test('formatDuration uses m:ss under an hour and h:mm:ss above', () => {
  expect(formatDuration(0)).toBe('0:00');
  expect(formatDuration(65)).toBe('1:05');
  expect(formatDuration(59.6)).toBe('1:00');
  expect(formatDuration(3600)).toBe('1:00:00');
  expect(formatDuration(3725)).toBe('1:02:05');
});

test('formatDistance shows km, with more precision under 10 km, and metres for swims', () => {
  expect(formatDistance(5432)).toBe('5.43 km');
  expect(formatDistance(10600)).toBe('10.6 km');
  expect(formatDistance(1900, 'swimming')).toBe('1,900 m');
});

test('formatPace uses each sport’s unit', () => {
  expect(formatPace('running', 10000, 3000)).toBe('5:00/km');
  expect(formatPace('cycling', 45200, 8177)).toBe('19.9 km/h');
  expect(formatPace('swimming', 1000, 1200)).toBe('2:00/100 m');
});

test('formatPace is empty without a distance or time', () => {
  expect(formatPace('running', undefined, 3000)).toBe('');
  expect(formatPace('running', 0, 3000)).toBe('');
  expect(formatPace('running', 1000, 0)).toBe('');
});
