import { formatZoneRange, heartRateZones, maxHeartRate, timeInZones } from '@/health/zones';

test('max heart rate is 220 less the age on the day', () => {
  expect(maxHeartRate(new Date('1990-10-28T00:00:00'), new Date('2026-10-27T12:00:00'))).toBe(185);
  expect(maxHeartRate(new Date('1990-10-27T00:00:00'), new Date('2026-10-27T12:00:00'))).toBe(184);
});

test('zones split the heart rate reserve at 60, 70, 80 and 90%', () => {
  // A reserve of 130 bpm over a resting 55.
  const zones = heartRateZones(185, 55);
  expect(zones.map((z) => [z.zone, z.min, z.max])).toEqual([
    [1, undefined, 132],
    [2, 133, 145],
    [3, 146, 158],
    [4, 159, 171],
    [5, 172, undefined],
  ]);
  expect(zones.map(formatZoneRange)).toEqual(['< 133 bpm', '133–145 bpm', '146–158 bpm', '159–171 bpm', '172+ bpm']);
});

test('time in zones counts each sample’s heart rate over the time before it', () => {
  const zones = heartRateZones(185, 55);
  const seconds = timeInZones(
    [
      { t: 0, d: 0 },
      { t: 10, d: 30, hr: 120 },
      { t: 20, d: 60, hr: 140 },
      // No reading: the last one carries on.
      { t: 30, d: 90 },
      { t: 40, d: 120, hr: 175 },
    ],
    zones
  );
  expect(seconds).toEqual([10, 20, 0, 0, 10]);
});

test('time in zones is empty without heart rate', () => {
  expect(
    timeInZones(
      [
        { t: 0, d: 0 },
        { t: 10, d: 30 },
      ],
      heartRateZones(185, 55)
    )
  ).toEqual([0, 0, 0, 0, 0]);
});
