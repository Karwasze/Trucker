import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type SelectOption = { key: string; label: string };

/** A field showing the picked option, opening a sheet of them all to pick another. */
export function Select({
  label,
  options,
  value,
  onChange,
}: {
  /** What is picked, e.g. "Exercise": the sheet's title and the field's accessibility label. */
  label: string;
  options: SelectOption[];
  value: string;
  onChange: (key: string) => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const picked = options.find((o) => o.key === value);

  const pick = (key: string) => {
    setOpen(false);
    if (key !== value) onChange(key);
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: picked?.label }}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.field,
          { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 },
        ]}>
        <ThemedText style={styles.value} numberOfLines={1}>
          {picked?.label}
        </ThemedText>
        <SymbolView
          name={{ ios: 'chevron.up.chevron.down', android: 'unfold_more', web: 'unfold_more' }}
          size={16}
          tintColor={theme.textSecondary}
          fallback={<ThemedText themeColor="textSecondary">▾</ThemedText>}
        />
      </Pressable>

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <View style={[styles.sheet, { backgroundColor: theme.background }]}>
          <View style={styles.header}>
            <ThemedText style={styles.title}>{label}</ThemedText>
            <Pressable onPress={() => setOpen(false)} hitSlop={10}>
              <ThemedText style={{ color: theme.accent, fontWeight: 600 }}>Cancel</ThemedText>
            </Pressable>
          </View>
          <FlatList
            data={options}
            keyExtractor={(o) => o.key}
            contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.four }}
            ItemSeparatorComponent={() => (
              <View style={[styles.separator, { backgroundColor: theme.backgroundSelected }]} />
            )}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: item.key === value }}
                onPress={() => pick(item.key)}
                style={({ pressed }) => [styles.row, pressed && { opacity: 0.5 }]}>
                <ThemedText style={{ flex: 1 }}>{item.label}</ThemedText>
                {item.key === value && <ThemedText style={{ color: theme.accent, fontWeight: 700 }}>✓</ThemedText>}
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: 12,
  },
  value: {
    flex: 1,
    fontWeight: 600,
  },
  sheet: {
    flex: 1,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.four,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
  },
});
