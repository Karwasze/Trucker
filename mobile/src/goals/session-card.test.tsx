import { screen } from '@testing-library/react-native';

import type { PlannedSession } from '@/api/types';
import { Colors } from '@/constants/theme';
import { SessionDetails, splitDescription } from '@/goals/session-card';
import { renderInApp } from '@/test-utils';

const session: PlannedSession = {
  id: 1,
  goal_id: 1,
  date: '2026-10-17',
  activity: 'running',
  kind: 'intervals',
  phase: 'peak',
  intensity: 'Z4',
  description: 'Intervals 6×800 m in zone 4, 2 min jog · 8 km in all',
  verdict: {
    status: 'partial',
    checks: [
      { name: 'Distance', actual: '8 km', target: '8 km', ok: true },
      { name: 'Reps', actual: '4', target: '6', ok: false },
    ],
  },
};

test('lists each check, marking the ones missed', async () => {
  await renderInApp(<SessionDetails session={session} />);
  expect(screen.getByText('✓ Distance 8 km (target 8 km)')).toBeOnTheScreen();
  expect(screen.getByText('✗ Reps 4 (target 6)')).toBeOnTheScreen();
});

test('compact leaves out the checks', async () => {
  await renderInApp(<SessionDetails session={session} compact />);
  expect(screen.queryByText(/^[✓✗]/)).toBeNull();
});

test.each([
  ['Easy run 8 km · zone 2', 'Easy run 8 km', ' · zone 2'],
  ['Intervals 6×800 m in zone 4, 2 min jog · 8 km in all', 'Intervals 6×800 m', ' in zone 4, 2 min jog · 8 km in all'],
  ['Tempo run 10 km: the middle half in zone 3', 'Tempo run 10 km', ': the middle half in zone 3'],
  ['Technique swim 1500 m · drills, zone 2', 'Technique swim 1500 m', ' · drills, zone 2'],
  ['Easy run 8 km · 130–145 bpm', 'Easy run 8 km', ' · 130–145 bpm'],
  [
    'Intervals 6×800 m @ 160–170 bpm, 2 min jog · 8 km in all',
    'Intervals 6×800 m',
    ' @ 160–170 bpm, 2 min jog · 8 km in all',
  ],
  ['Tempo run 10 km: the middle half @ 150–160 bpm', 'Tempo run 10 km', ': the middle half @ 150–160 bpm'],
  ['Race: run 10 km', 'Race: run 10 km', ''],
])('splits %s into its name and its target', (description, name, details) => {
  expect(splitDescription(description)).toEqual({ name, details });
});

test('shows the target after the name in grey', async () => {
  await renderInApp(<SessionDetails session={{ ...session, description: 'Easy run 8 km · zone 2' }} compact />);
  expect(screen.getByText('🏃 Easy run 8 km · zone 2')).toBeOnTheScreen();
  expect(screen.getByText(' · zone 2')).toHaveStyle({ color: Colors.light.textSecondary });
});
