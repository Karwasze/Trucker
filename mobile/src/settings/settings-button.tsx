import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

/** Opens Settings, which lives outside the tab bar. */
export function SettingsButton() {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Settings"
      hitSlop={12}
      onPress={() => router.push('/settings')}
      style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
      <SymbolView
        name={{ ios: 'gearshape', android: 'settings', web: 'settings' }}
        size={24}
        tintColor={theme.textSecondary}
        fallback={<ThemedText style={{ color: theme.textSecondary, fontSize: 22 }}>⚙</ThemedText>}
      />
    </Pressable>
  );
}
