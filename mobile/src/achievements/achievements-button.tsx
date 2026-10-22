import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

/** Opens Achievements, which lives outside the tab bar. */
export function AchievementsButton() {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Achievements"
      hitSlop={12}
      onPress={() => router.push('/achievements')}
      style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
      <SymbolView
        name={{ ios: 'trophy', android: 'emoji_events', web: 'emoji_events' }}
        size={24}
        tintColor={theme.textSecondary}
        fallback={<ThemedText style={{ color: theme.textSecondary, fontSize: 22 }}>🏆</ThemedText>}
      />
    </Pressable>
  );
}
