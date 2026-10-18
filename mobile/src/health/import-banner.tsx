import { router } from 'expo-router';
import { Pressable } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui';

/**
 * Says how many Health workouts wait to be imported, opening the review
 * sheet, or that Health couldn't be read. Nothing for 0 and no error.
 */
export function HealthImportBanner({ count, error }: { count: number; error?: string | null }) {
  if (error) {
    return (
      <Pressable onPress={() => router.navigate('/health-import')} accessibilityRole="button">
        <Card>
          <ThemedText type="smallBold">Couldn&apos;t check Apple Health</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {error}
          </ThemedText>
        </Card>
      </Pressable>
    );
  }
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
