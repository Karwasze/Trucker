import { render, screen, userEvent } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SeriesPicker, type Series } from '@/progress/series-picker';

async function renderPicker(value: Series, onChange = jest.fn(), bodyweight = true) {
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}>
      <SeriesPicker
        value={value}
        exercises={['Bench Press', 'Squat']}
        activities={['cycling']}
        bodyweight={bodyweight}
        onChange={onChange}
      />
    </SafeAreaProvider>
  );
  return onChange;
}

test('the heading names the series and opens a list of all of them', async () => {
  const user = userEvent.setup();
  await renderPicker({ kind: 'cardio', activity: 'cycling' });
  await user.press(screen.getByRole('button', { name: 'Cycling, change exercise' }));
  const options = screen.getAllByRole('button').filter((b) => b.props.accessibilityState?.selected !== undefined);
  expect(options.map((o) => o.props.accessibilityState.selected)).toEqual([false, true, false, false]);
  expect(screen.getByText('Bodyweight')).toBeOnTheScreen();
  expect(screen.getByText('Bench Press')).toBeOnTheScreen();
});

test('searching narrows the list, and picking reports the series', async () => {
  const user = userEvent.setup();
  const onChange = await renderPicker({ kind: 'bodyweight' });
  await user.press(screen.getByRole('button', { name: 'Bodyweight, change exercise' }));
  await user.type(screen.getByPlaceholderText('Search'), 'squ');
  expect(screen.queryByText('Bench Press')).not.toBeOnTheScreen();
  await user.press(screen.getByText('Squat'));
  expect(onChange).toHaveBeenCalledWith({ kind: 'exercise', name: 'Squat' });
});

test('bodyweight can be left out', async () => {
  const user = userEvent.setup();
  await renderPicker({ kind: 'cardio', activity: 'cycling' }, jest.fn(), false);
  await user.press(screen.getByRole('button', { name: 'Cycling, change exercise' }));
  expect(screen.queryByText('Bodyweight')).not.toBeOnTheScreen();
});
