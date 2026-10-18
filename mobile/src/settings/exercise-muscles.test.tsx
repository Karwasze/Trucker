import AsyncStorage from '@react-native-async-storage/async-storage';
import { screen, userEvent } from '@testing-library/react-native';

import { ExerciseMuscles } from '@/settings/exercise-muscles';
import { mockAlerts, mockServer, renderInApp, selectPlan, type Request } from '@/test-utils';

function server({ saves = true } = {}) {
  return mockServer({
    'GET /api/exercises': [{ id: 1, name: 'Squat', is_default: true, muscles: [] }],
    'GET /api/statistics': { exercises: ['Farmer Carry', 'Squat'], data: [] },
    'GET /api/exercise-muscles': {
      Squat: [
        { muscle: 'quads', role: 'primary' },
        { muscle: 'glutes', role: 'secondary' },
      ],
    },
    ...(saves && { 'PUT /api/exercise-muscles': ({ body }: Request) => body }),
  });
}

beforeEach(async () => {
  await AsyncStorage.clear();
  await selectPlan(null);
});

test('library and logged exercises are listed once each, with their tags', async () => {
  server();
  await renderInApp(<ExerciseMuscles />);
  expect(await screen.findByText('Quads · glutes')).toBeOnTheScreen();
  expect(screen.getByText('Untagged')).toBeOnTheScreen();
  expect(screen.getAllByText('Squat')).toHaveLength(1);
});

test('tapping a muscle cycles primary, secondary, untagged; Save stores the tags', async () => {
  const requests = server();
  const user = userEvent.setup();
  await renderInApp(<ExerciseMuscles />);
  await user.press(await screen.findByRole('button', { name: /Farmer Carry/ }));
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

  const chip = (muscle: string) => screen.getByLabelText(new RegExp(`^${muscle}: `));
  await user.press(chip('core'));
  expect(chip('core')).toHaveAccessibleName('core: primary');
  await user.press(chip('back'));
  await user.press(chip('back'));
  expect(chip('back')).toHaveAccessibleName('back: secondary');
  await user.press(chip('biceps'));
  await user.press(chip('biceps'));
  await user.press(chip('biceps'));
  expect(chip('biceps')).toHaveAccessibleName('biceps: not worked');
  expect(screen.getByText('Unsaved: Core · back')).toBeOnTheScreen();

  await user.press(screen.getByRole('button', { name: 'Save' }));
  // Sorted in the app's muscle order.
  expect(requests.find((r) => r.method === 'PUT')?.body).toEqual({
    name: 'Farmer Carry',
    muscles: [
      { muscle: 'back', role: 'secondary' },
      { muscle: 'core', role: 'primary' },
    ],
  });
  expect(await screen.findByText('Core · back')).toBeOnTheScreen();
});

test('cancelling discards the changes', async () => {
  server();
  const user = userEvent.setup();
  await renderInApp(<ExerciseMuscles />);
  await user.press(await screen.findByRole('button', { name: /^Squat/ }));
  await user.press(screen.getByLabelText('quads: primary'));
  await user.press(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByText('Quads · glutes')).toBeOnTheScreen();
});

test('a failed save says why and keeps the changes', async () => {
  server({ saves: false });
  const alerts = mockAlerts();
  const user = userEvent.setup();
  await renderInApp(<ExerciseMuscles />);
  await user.press(await screen.findByRole('button', { name: /Farmer Carry/ }));
  await user.press(screen.getByLabelText('core: not worked'));
  await user.press(screen.getByRole('button', { name: 'Save' }));
  expect(alerts.latest().title).toBe("Couldn't save muscles");
  expect(screen.getByText('Unsaved: Core')).toBeOnTheScreen();
});
