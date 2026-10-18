import { bucketSamples, distanceAt, lapsFrom } from '@/health/samples';

const start = 1_000_000;
const s = (seconds: number) => start + seconds * 1000;

test('a distance reading over several buckets is spread evenly', () => {
  const samples = bucketSamples(start, s(30), [{ start: s(0), end: s(30), value: 90 }], []);
  expect(samples).toEqual([
    { t: 0, d: 0 },
    { t: 10, d: 30 },
    { t: 20, d: 60 },
    { t: 30, d: 90 },
  ]);
});

test('a reading overlapping the start counts in full inside the workout; instant readings land in their bucket', () => {
  const samples = bucketSamples(
    start,
    s(20),
    [
      // Half falls before the start, but all 40 m are spread over the part inside.
      { start: s(-10), end: s(10), value: 40 },
      { start: s(15), end: s(15), value: 5 },
    ],
    []
  );
  expect(samples.map((x) => x.d)).toEqual([0, 40, 45]);
});

test('heart rate is averaged per bucket and left out where there were no readings', () => {
  const samples = bucketSamples(
    start,
    s(20),
    [],
    [
      { start: s(1), end: s(1), value: 120 },
      { start: s(5), end: s(5), value: 130 },
      { start: s(25), end: s(25), value: 200 }, // After the end: ignored.
    ]
  );
  expect(samples[1].hr).toBe(125);
  expect(samples[2]).not.toHaveProperty('hr');
});

test('a workout shorter than a bucket still gets one', () => {
  expect(bucketSamples(start, s(3), [{ start: s(0), end: s(3), value: 10 }], [])).toEqual([
    { t: 0, d: 0 },
    { t: 10, d: 10 },
  ]);
});

test('distanceAt interpolates between samples and holds at the ends', () => {
  const samples = [
    { t: 0, d: 0 },
    { t: 10, d: 50 },
    { t: 20, d: 70 },
  ];
  expect(distanceAt(samples, 5)).toBe(25);
  expect(distanceAt(samples, 15)).toBe(60);
  expect(distanceAt(samples, 99)).toBe(70);
  expect(distanceAt([], 5)).toBe(0);
});

test('lapsFrom gives each lap its offset, duration and distance', () => {
  const samples = [
    { t: 0, d: 0 },
    { t: 60, d: 300 },
    { t: 120, d: 500 },
  ];
  expect(
    lapsFrom(
      start,
      [
        { start: s(0), end: s(60) },
        { start: s(60), end: s(120) },
      ],
      samples
    )
  ).toEqual([
    { t: 0, duration: 60, d: 300 },
    { t: 60, duration: 60, d: 200 },
  ]);
});
