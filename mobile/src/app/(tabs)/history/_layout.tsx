import { Stack } from 'expo-router';

export default function HistoryLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false, title: 'History' }} />
      <Stack.Screen name="[id]" options={{ title: 'Workout', headerBackTitle: 'History' }} />
      <Stack.Screen name="cardio/[id]" options={{ title: 'Workout', headerBackTitle: 'History' }} />
    </Stack>
  );
}
