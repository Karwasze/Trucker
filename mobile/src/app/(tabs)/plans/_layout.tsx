import { Stack } from 'expo-router';

// Opened on a plan or goal from elsewhere, e.g. Insights, the list stays
// underneath to go back to.
export const unstable_settings = { anchor: 'index' };

export default function PlansLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false, title: 'Training Plan' }} />
      <Stack.Screen name="[id]" options={{ title: 'Plan', headerBackTitle: 'Plans' }} />
      <Stack.Screen name="goal" options={{ title: 'Goal', headerBackTitle: 'Plans' }} />
      <Stack.Screen name="goal-calendar" options={{ title: 'Goal', headerBackTitle: 'Plans' }} />
    </Stack>
  );
}
