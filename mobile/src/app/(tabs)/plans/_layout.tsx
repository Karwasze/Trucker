import { Stack } from 'expo-router';

export default function PlansLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false, title: 'Plans' }} />
      <Stack.Screen name="[id]" options={{ title: 'Plan', headerBackTitle: 'Plans' }} />
      <Stack.Screen name="goal" options={{ title: 'Goal', headerBackTitle: 'Plans' }} />
      <Stack.Screen name="goal-calendar" options={{ title: 'Goal', headerBackTitle: 'Plans' }} />
    </Stack>
  );
}
