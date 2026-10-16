import { router } from 'expo-router';
import { Pressable } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui';

/** Says how many Health workouts wait to be imported, opening the review sheet. Nothing for 0. */
export function HealthImportBanner({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <Pressable onPress={() => router.navigate('/health-import')} accessibilityRole="button">
      <Card>
        <ThemedText type="smallBold">
          {count} new {count === 1 ? 'workout' : 'workouts'} from Apple Health
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Tap to review and import.
        </ThemedText>
      </Card>
    </Pressable>
  );
}
