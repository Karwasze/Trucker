import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Row of equal-width stat tiles above a progress chart. */
export function TileRow({ children }: { children: ReactNode }) {
  return <View style={styles.tiles}>{children}</View>;
}

export function Tile({ label, value }: { label: string; value: string }) {
  return (
    <Card style={styles.tile}>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
        {label}
      </ThemedText>
      <ThemedText style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </ThemedText>
    </Card>
  );
}

/** A tile-shaped tab, for picking what a row of them switches between. */
export function TileButton({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        styles.button,
        { backgroundColor: selected ? theme.accent : theme.backgroundElement, opacity: pressed ? 0.7 : 1 },
      ]}>
      <ThemedText type="smallBold" style={{ color: selected ? theme.onAccent : theme.text }} numberOfLines={1}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tiles: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  tile: {
    flex: 1,
    gap: Spacing.one,
    padding: Spacing.three,
  },
  button: {
    alignItems: 'center',
    borderRadius: 16,
  },
  value: {
    fontSize: 20,
    fontWeight: 700,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
});
