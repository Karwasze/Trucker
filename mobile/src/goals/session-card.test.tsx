import { screen } from '@testing-library/react-native';

import type { PlannedSession } from '@/api/types';
import { SessionDetails } from '@/goals/session-card';
import { renderInApp } from '@/test-utils';

const session: PlannedSession = {
  id: 1,
  goal_id: 1,
  date: '2026-10-17',
  activity: 'cycling',
  kind: 'long',
  phase: 'build',
  intensity: 'easy',
  description: 'Long ride 60 km · 101–126 bpm, with 20 km @ 134–148 bpm in the middle',
  verdict: {
    status: 'met',
    checks: [
      { name: 'Distance', actual: '60.0 km', target: '60.0 km', ok: true },
      {
        name: 'Tempo block heart rate',
        actual: '160 bpm',
        target: '134–148 bpm',
        ok: true,
        warning: 'Harder than planned: ease off to keep fresh for the next sessions.',
      },
    ],
  },
};

test('a check done harder than planned counts, with its warning', async () => {
  await renderInApp(<SessionDetails session={session} />);
  expect(screen.getByText('Met')).toBeOnTheScreen();
  expect(screen.getByText('✓ Tempo block heart rate 160 bpm (target 134–148 bpm)')).toBeOnTheScreen();
  expect(screen.getByText('⚠ Harder than planned: ease off to keep fresh for the next sessions.')).toBeOnTheScreen();
  expect(screen.queryByText(/⚠.*Distance/)).toBeNull();
});

test('compact leaves out the checks and their warnings', async () => {
  await renderInApp(<SessionDetails session={session} compact />);
  expect(screen.queryByText(/^⚠/)).toBeNull();
});
