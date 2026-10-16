import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { CardioActivity } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * What the Progress tab shows: the bodyweight log, one exercise's estimated
 * 1RM, or one activity's cardio workouts.
 */
export type Series =
  | { kind: 'bodyweight' }
  | { kind: 'exercise'; name: string }
  | { kind: 'cardio'; activity: CardioActivity };

const CARDIO_NAMES: Record<CardioActivity, string> = {
  running: 'Running',
  cycling: 'Cycling',
  swimming: 'Swimming',
  walking: 'Walking',
  hiking: 'Hiking',
};

const seriesLabel = (s: Series) =>
  s.kind === 'bodyweight' ? 'Bodyweight' : s.kind === 'cardio' ? CARDIO_NAMES[s.activity] : s.name;

const seriesKey = (s: Series) =>
  s.kind === 'bodyweight' ? ':bodyweight' : s.kind === 'cardio' ? `:cardio:${s.activity}` : s.name;

/** Large heading naming the current series; tapping it opens a list to switch series. */
export function SeriesPicker({
  value,
  exercises,
  activities = [],
  onChange,
}: {
  value: Series;
  exercises: string[];
  /** Cardio activities with workouts, listed after bodyweight. */
  activities?: CardioActivity[];
  onChange: (series: Series) => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const options: Series[] = [
    { kind: 'bodyweight' },
    ...activities.map((activity) => ({ kind: 'cardio' as const, activity })),
    ...exercises.map((name) => ({ kind: 'exercise' as const, name })),
  ];
  const term = search.trim().toLowerCase();
  const filtered = term ? options.filter((s) => seriesLabel(s).toLowerCase().includes(term)) : options;

  const close = () => {
    setSearch('');
    setOpen(false);
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${seriesLabel(value)}, change exercise`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.title, pressed && { opacity: 0.5 }]}>
        <ThemedText style={styles.titleText} numberOfLines={1}>
          {seriesLabel(value)}
        </ThemedText>
        <SymbolView
          name={{ ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }}
          size={18}
          weight="semibold"
          tintColor={theme.accent}
          fallback={<ThemedText style={{ color: theme.accent }}>▾</ThemedText>}
        />
      </Pressable>

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
        <View style={[styles.sheet, { backgroundColor: theme.background }]}>
          <View style={styles.header}>
            <ThemedText style={{ fontSize: 20, fontWeight: 700 }}>Show progress for</ThemedText>
            <Pressable onPress={close} hitSlop={10}>
              <ThemedText style={{ color: theme.accent, fontWeight: 600 }}>Done</ThemedText>
            </Pressable>
          </View>

          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search"
            placeholderTextColor={theme.textSecondary}
            autoCorrect={false}
            clearButtonMode="while-editing"
            style={[styles.search, { color: theme.text, backgroundColor: theme.backgroundElement }]}
          />

          <FlatList
            data={filtered}
            keyExtractor={seriesKey}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.four }}
            ItemSeparatorComponent={() => (
              <View style={[styles.separator, { backgroundColor: theme.backgroundSelected }]} />
            )}
            renderItem={({ item }) => {
              const selected = seriesKey(item) === seriesKey(value);
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    onChange(item);
                    close();
                  }}
                  style={({ pressed }) => [styles.row, pressed && { opacity: 0.5 }]}>
                  <ThemedText style={[{ flex: 1 }, selected && { color: theme.accent, fontWeight: 600 }]}>
                    {seriesLabel(item)}
                  </ThemedText>
                  {selected && <ThemedText style={{ color: theme.accent, fontWeight: 600 }}>✓</ThemedText>}
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  title: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  titleText: {
    flexShrink: 1,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: 700,
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
  search: {
    height: 44,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
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
