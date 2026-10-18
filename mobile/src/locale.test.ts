// The test script pins the time zone and locale so date formatting is stable.
test('runs in a fixed time zone and locale', () => {
  expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('Europe/Warsaw');
  expect(new Date(2026, 9, 12).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })).toBe('12 Oct');
});
