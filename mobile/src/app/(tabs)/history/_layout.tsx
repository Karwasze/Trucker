import { Stack } from 'expo-router';

// Opened on a workout from elsewhere, e.g. Current week or Progress, the list
// stays underneath to go back to.
export const unstable_settings = { anchor: 'index' };

export default function HistoryLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false, title: 'History' }} />
      <Stack.Screen name="[id]" options={{ title: 'Workout', headerBackTitle: 'History' }} />
      <Stack.Screen name="cardio/[id]" options={{ title: 'Workout', headerBackTitle: 'History' }} />
      <Stack.Screen name="triathlon/[date]" options={{ title: 'Triathlon', headerBackTitle: 'History' }} />
    </Stack>
  );
}
