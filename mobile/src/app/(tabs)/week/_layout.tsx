import { Stack } from 'expo-router';

// Workouts open on top of the week, going back to it rather than to History.
export const unstable_settings = { anchor: 'index' };

export default function WeekLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false, title: 'Current week' }} />
      <Stack.Screen name="workout/[id]" options={{ title: 'Workout', headerBackTitle: 'Current week' }} />
      <Stack.Screen name="cardio/[id]" options={{ title: 'Workout', headerBackTitle: 'Current week' }} />
    </Stack>
  );
}
