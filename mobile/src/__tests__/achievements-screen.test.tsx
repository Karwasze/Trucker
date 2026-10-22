import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Pressable, Text } from 'react-native';

import { AchievementsProvider, useAchievements } from '@/achievements/achievements-context';
import type { Achievement } from '@/api/types';
import AchievementsScreen from '@/app/achievements';
import { SERVER, mockServer, renderInApp, selectPlan, setNow } from '@/test-utils';

const fiveK = (earned: number): Achievement => ({
  id: 'pace-running-5000',
  category: 'pace',
  title: '5 km run',
  activity: 'running',
  distance_m: 5000,
  best: earned === 3 ? 1170 : 1440,
  tiers: [
    { target: 1800, earned_on: '2026-03-10', workout_id: 7 },
    { target: 1500, earned_on: '2026-03-10', workout_id: 7 },
    earned === 3 ? { target: 1200, earned_on: '2026-10-18', workout_id: 9 } : { target: 1200 },
  ],
});
const squat: Achievement = {
  id: 'strength-squat',
  category: 'strength',
  title: 'Squat',
  activity: 'Squat',
  best: 1.41,
  tiers: [
    { name: 'Novice', target: 1.25, earned_on: '2026-02-01', workout_id: 3 },
    { name: 'Intermediate', target: 1.5 },
  ],
};
const triathlon: Achievement = {
  id: 'triathlon',
  category: 'triathlon',
  title: 'Triathlon',
  tiers: [{ name: 'Sprint', target: 25750 }],
};

beforeEach(async () => {
  jest.clearAllMocks();
  setNow('2026-10-18T12:00:00+02:00');
  await AsyncStorage.clear();
  await selectPlan(null);
});
afterEach(() => jest.useRealTimers());

test('the Achievements screen lists badges by category with the tiers earned', async () => {
  mockServer({ 'GET /api/achievements': [fiveK(2), triathlon, squat] });
  const user = userEvent.setup();
  await renderInApp(<AchievementsScreen />);

  expect(await screen.findByText('3 of 6 badges earned')).toBeOnTheScreen();
  expect(screen.getByText('5 km run')).toBeOnTheScreen();
  expect(screen.getByText('Best 24:00')).toBeOnTheScreen();
  expect(screen.getByText('2/3')).toBeOnTheScreen();
  expect(screen.getByText('Under 20:00')).toBeOnTheScreen();
  expect(screen.getByText('Best 1.41× bodyweight')).toBeOnTheScreen();
  expect(screen.getByText('1.5× bodyweight')).toBeOnTheScreen();
  expect(screen.getByLabelText('Sprint, not earned yet')).toBeOnTheScreen();

  // An earned tier opens what earned it.
  await user.press(screen.getByRole('button', { name: 'Novice, earned Sun, 1 Feb 2026' }));
  expect(router.push).toHaveBeenCalledWith({ pathname: '/history/[id]', params: { id: 3 } });
});

/** A screen that checks for new achievements, as saving a workout does. */
function Saver() {
  const { check } = useAchievements();
  return (
    <Pressable onPress={check}>
      <Text>Save</Text>
    </Pressable>
  );
}

test('newly earned tiers are celebrated once, but not those earned before the first check', async () => {
  let list = [fiveK(2), squat];
  const requests = mockServer({ 'GET /api/achievements': () => list });
  const user = userEvent.setup();
  await renderInApp(
    <AchievementsProvider>
      <Saver />
    </AchievementsProvider>
  );

  // The first check only remembers what was earned already.
  await act(async () => {});
  expect(requests.filter((r) => r.path === '/api/achievements')).toHaveLength(1);
  expect(screen.queryByText('Achievement unlocked')).toBeNull();
  expect(JSON.parse((await AsyncStorage.getItem(`trucker.achievements.seen:${SERVER}`))!)).toHaveLength(3);

  list = [fiveK(3), squat];
  await user.press(screen.getByText('Save'));
  expect(await screen.findByText('Achievement unlocked')).toBeOnTheScreen();
  expect(screen.getByText('5 km run')).toBeOnTheScreen();
  expect(screen.getByText('Under 20:00')).toBeOnTheScreen();

  await user.press(screen.getByText('See all achievements'));
  expect(router.push).toHaveBeenCalledWith('/achievements');
  expect(screen.queryByText('Achievement unlocked')).toBeNull();

  // Already celebrated.
  await user.press(screen.getByText('Save'));
  await act(async () => {});
  expect(screen.queryByText('Achievement unlocked')).toBeNull();
});
