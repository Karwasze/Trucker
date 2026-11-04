import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen } from '@testing-library/react-native';

import { TargetWeightCard } from '@/diet/target-weight-card';
import { mockServer, renderInApp, type Request } from '@/test-utils';

function server(initial: number | null) {
  let target = initial;
  return mockServer({
    'GET /api/diet/target': () => ({ target_weight_kg: target }),
    'PUT /api/diet/target': ({ body }: Request) => {
      target = (body as { target_weight_kg: number | null }).target_weight_kg;
      return { target_weight_kg: target };
    },
  });
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

test('saves a target weight when the field is left', async () => {
  const requests = server(null);
  await renderInApp(<TargetWeightCard />);
  const input = await screen.findByLabelText('Target weight in kg');
  await fireEvent.changeText(input, '78,5');
  await fireEvent(input, 'blur');
  expect(requests.find((r) => r.method === 'PUT')?.body).toEqual({ target_weight_kg: 78.5 });
  expect(await screen.findByDisplayValue('78.5')).toBeOnTheScreen();
});

test('clears the target when emptied, and sends nothing unchanged or invalid', async () => {
  const requests = server(80);
  await renderInApp(<TargetWeightCard />);
  const input = await screen.findByDisplayValue('80');
  await fireEvent(input, 'blur');
  await fireEvent.changeText(input, 'abc');
  await fireEvent(input, 'blur');
  expect(screen.getByText('Enter a weight in kg, e.g. 78.5.')).toBeOnTheScreen();
  expect(requests.some((r) => r.method === 'PUT')).toBe(false);

  await fireEvent.changeText(input, '');
  await fireEvent(input, 'submitEditing');
  expect(requests.find((r) => r.method === 'PUT')?.body).toEqual({ target_weight_kg: null });
});
