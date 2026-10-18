import AsyncStorage from '@react-native-async-storage/async-storage';
import { screen, userEvent } from '@testing-library/react-native';
import { useState } from 'react';

import { mockServer, renderInApp, selectPlan } from '@/test-utils';
import { draftExercise, type DraftExercise } from '@/workout/draft';
import { ExerciseCard } from '@/workout/exercise-card';

/** The card with its exercise kept in state, as Today keeps it. */
function Harness({
  initial,
  onChangeScheme,
  onRemove = () => {},
}: {
  initial: DraftExercise;
  onChangeScheme?: (sets: number, reps: number) => void;
  onRemove?: () => void;
}) {
  const [exercise, setExercise] = useState(initial);
  return (
    <ExerciseCard exercise={exercise} onChange={setExercise} onRemove={onRemove} onChangeScheme={onChangeScheme} />
  );
}

const row = draftExercise('Row', [
  { weight: 60, reps: 8 },
  { weight: 60, reps: 8 },
]);

beforeEach(async () => {
  await AsyncStorage.clear();
  await selectPlan(null);
  mockServer({});
});

test('ticking sets counts them off', async () => {
  const user = userEvent.setup();
  await renderInApp(<Harness initial={row} />);
  expect(screen.getByText('0/2')).toBeOnTheScreen();
  await user.press(screen.getByRole('checkbox', { name: 'Set 2 done' }));
  expect(screen.getByText('1/2')).toBeOnTheScreen();
  await user.press(screen.getByRole('checkbox', { name: 'Set 2 done' }));
  expect(screen.getByText('0/2')).toBeOnTheScreen();
});

test('a new set copies the last one, and long-pressing a set number removes it', async () => {
  const user = userEvent.setup();
  await renderInApp(<Harness initial={row} />);
  await user.press(screen.getByRole('button', { name: '+ Add set' }));
  expect(screen.getByLabelText('Set 3 weight')).toHaveDisplayValue('60');
  expect(screen.getByLabelText('Set 3 reps')).toHaveDisplayValue('8');
  await user.longPress(screen.getByText('3'));
  expect(screen.queryByLabelText('Set 3 weight')).not.toBeOnTheScreen();
});

test('inputs accept a decimal comma for weight and only digits for reps', async () => {
  const user = userEvent.setup();
  await renderInApp(<Harness initial={row} />);
  const weight = screen.getByLabelText('Set 1 weight');
  await user.clear(weight);
  await user.type(weight, '62,5');
  expect(weight).toHaveDisplayValue('62.5');
  const reps = screen.getByLabelText('Set 1 reps');
  await user.clear(reps);
  await user.type(reps, '1x0');
  expect(reps).toHaveDisplayValue('10');
});

test('an exercise outside the plan can be retargeted to another scheme', async () => {
  const onChangeScheme = jest.fn();
  const user = userEvent.setup();
  await renderInApp(<Harness initial={row} onChangeScheme={onChangeScheme} />);
  await user.press(screen.getByRole('button', { name: 'Change sets × reps' }));
  expect(screen.getByLabelText('Sets')).toHaveDisplayValue('2');
  expect(screen.getByLabelText('Reps')).toHaveDisplayValue('8');
  await user.clear(screen.getByLabelText('Sets'));
  await user.type(screen.getByLabelText('Sets'), '5');
  await user.clear(screen.getByLabelText('Reps'));
  await user.type(screen.getByLabelText('Reps'), '5');
  await user.press(screen.getByRole('button', { name: 'Apply' }));
  expect(onChangeScheme).toHaveBeenCalledWith(5, 5);
});

test('the scheme can’t change once a set is done', async () => {
  const user = userEvent.setup();
  await renderInApp(<Harness initial={row} onChangeScheme={jest.fn()} />);
  await user.press(screen.getByRole('checkbox', { name: 'Set 1 done' }));
  expect(screen.queryByRole('button', { name: 'Change sets × reps' })).not.toBeOnTheScreen();
});
