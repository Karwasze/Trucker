import { Stack } from 'expo-router';

// Workouts open on top of Today, going back to it rather than to History.
export const unstable_settings = { anchor: 'index' };

export default function TodayLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false, title: 'Today' }} />
      <Stack.Screen name="cardio/[id]" options={{ title: 'Workout', headerBackTitle: 'Today' }} />
    </Stack>
  );
}
