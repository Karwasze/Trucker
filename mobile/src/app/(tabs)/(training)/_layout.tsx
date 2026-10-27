import { Stack } from 'expo-router';

// Opened on a workout or plan from elsewhere, e.g. the week on Workout, the
// Plan and History lists stay underneath to go back to.
export const unstable_settings = { anchor: '(lists)' };

export default function TrainingLayout() {
  return (
    <Stack>
      <Stack.Screen name="(lists)" options={{ headerShown: false, title: 'Training' }} />
      <Stack.Screen name="plans/[id]" options={{ title: 'Plan', headerBackTitle: 'Plans' }} />
      <Stack.Screen name="plans/goal" options={{ title: 'Goal', headerBackTitle: 'Plans' }} />
      <Stack.Screen name="plans/goal-calendar" options={{ title: 'Goal', headerBackTitle: 'Plans' }} />
      <Stack.Screen name="history/[id]" options={{ title: 'Workout', headerBackTitle: 'History' }} />
      <Stack.Screen name="history/cardio/[id]" options={{ title: 'Workout', headerBackTitle: 'History' }} />
      <Stack.Screen name="history/triathlon/[date]" options={{ title: 'Triathlon', headerBackTitle: 'History' }} />
    </Stack>
  );
}
