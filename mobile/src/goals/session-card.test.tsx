import { screen } from '@testing-library/react-native';

import type { PlannedSession } from '@/api/types';
import { SessionDetails } from '@/goals/session-card';
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
