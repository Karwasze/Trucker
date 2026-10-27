import AsyncStorage from '@react-native-async-storage/async-storage';
import { screen, userEvent } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import type { Workout } from '@/api/types';
import WorkoutDetailScreen from '@/app/(tabs)/(training)/history/[id]';
import { mockAlerts, mockServer, renderInApp, selectPlan, type Request } from '@/test-utils';

const workout: Workout = {
  id: 4,
  date: '2026-10-16',
  plan_id: 1,
  exercises: [
    {
      name: 'Squat',
      sets: [
        { weight: 100, reps: 5 },
        { weight: 100, reps: 4 },
      ],
    },
  ],
};

function server() {
  let workouts = [workout];
  return mockServer({
    'GET /api/workouts': () => workouts,
    'PUT /api/workouts': ({ body }: Request) => {
      workouts = [{ ...workout, ...(body as Workout) }];
      return workouts[0];
    },
    'DELETE /api/workouts': { success: true },
  });
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  await selectPlan(null);
  jest.mocked(useLocalSearchParams).mockReturnValue({ id: '4' });
});

test('shows the workout’s sets and volume', async () => {
  server();
  await renderInApp(<WorkoutDetailScreen />);
  expect(await screen.findByText('Friday, 16 October 2026 · 900 kg volume')).toBeOnTheScreen();
  expect(screen.getByText('100 kg × 5')).toBeOnTheScreen();
  expect(screen.getByText('100 kg × 4')).toBeOnTheScreen();
});

test('a workout that no longer exists says so', async () => {
  jest.mocked(useLocalSearchParams).mockReturnValue({ id: '99' });
  server();
  await renderInApp(<WorkoutDetailScreen />);
  expect(await screen.findByText('Workout not found.')).toBeOnTheScreen();
});

test('edits are saved without touching the plan', async () => {
  const requests = server();
  const user = userEvent.setup();
  await renderInApp(<WorkoutDetailScreen />);
  await user.press(await screen.findByRole('button', { name: 'Edit workout' }));
  const reps = screen.getByLabelText('Set 2 reps');
  await user.clear(reps);
  await user.type(reps, '5');
  await user.press(screen.getByRole('button', { name: 'Save changes' }));

  expect(await screen.findByText('Friday, 16 October 2026 · 1,000 kg volume')).toBeOnTheScreen();
  expect(screen.getAllByText('100 kg × 5')).toHaveLength(2);
  expect(requests.find((r) => r.method === 'PUT')?.body).toEqual({
    id: 4,
    date: '2026-10-16',
    exercises: [
      {
        name: 'Squat',
        sets: [
          { weight: 100, reps: 5 },
          { weight: 100, reps: 5 },
        ],
      },
    ],
  });
});

test('a workout emptied of sets can’t be saved', async () => {
  const requests = server();
  const alerts = mockAlerts();
  const user = userEvent.setup();
  await renderInApp(<WorkoutDetailScreen />);
  await user.press(await screen.findByRole('button', { name: 'Edit workout' }));
  for (const label of ['Set 1 reps', 'Set 2 reps']) await user.clear(screen.getByLabelText(label));
  await user.press(screen.getByRole('button', { name: 'Save changes' }));
  expect(alerts.latest().title).toBe("Can't save workout");
  expect(requests.some((r) => r.method === 'PUT')).toBe(false);
});

test('cancelling unsaved edits asks first', async () => {
  server();
  const alerts = mockAlerts();
  const user = userEvent.setup();
  await renderInApp(<WorkoutDetailScreen />);
  await user.press(await screen.findByRole('button', { name: 'Edit workout' }));
  await user.press(screen.getByRole('button', { name: 'Cancel' }));
  // Nothing changed yet: straight back to viewing.
  expect(screen.getByRole('button', { name: 'Edit workout' })).toBeOnTheScreen();

  await user.press(screen.getByRole('button', { name: 'Edit workout' }));
  await user.type(screen.getByLabelText('Set 1 weight'), '5');
  await user.press(screen.getByRole('button', { name: 'Cancel' }));
  expect(alerts.latest().title).toBe('Discard changes?');
  await alerts.press('Discard');
  expect(screen.getByText('100 kg × 5')).toBeOnTheScreen();
});

test('deleting asks first, then goes back', async () => {
  const requests = server();
  const alerts = mockAlerts();
  const user = userEvent.setup();
  await renderInApp(<WorkoutDetailScreen />);
  await user.press(await screen.findByRole('button', { name: 'Delete workout' }));
  await alerts.press('Delete');
  expect(requests.find((r) => r.method === 'DELETE')?.query.get('id')).toBe('4');
  expect(router.back).toHaveBeenCalled();
});
