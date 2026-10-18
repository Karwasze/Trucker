import { useEffect, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ExerciseDB } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { Message } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSettings } from '@/settings/settings-context';

type Props = {
  visible: boolean;
  onClose: () => void;
  onPick: (name: string) => void;
};

export function ExercisePicker({ visible, onClose, onPick }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { api } = useSettings();
  const [exercises, setExercises] = useState<ExerciseDB[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!visible) return;
    api
      .listExercises()
      .then((list) => {
        setExercises(list);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, [visible, api]);

  const term = search.trim();
  const filtered = (exercises ?? []).filter((e) => e.name.toLowerCase().includes(term.toLowerCase()));
  const exactMatch = filtered.some((e) => e.name.toLowerCase() === term.toLowerCase());

  const close = () => {
    setSearch('');
    onClose();
  };

  const pick = (name: string) => {
    onPick(name);
    close();
  };

  const create = async () => {
    try {
      const created = await api.createExercise(term);
      pick(created.name);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <View style={[styles.sheet, { backgroundColor: theme.background }]}>
        <View style={styles.header}>
          <ThemedText style={{ fontSize: 20, fontWeight: 700 }}>Add exercise</ThemedText>
          <Pressable onPress={close} hitSlop={10}>
            <ThemedText style={{ color: theme.accent, fontWeight: 600 }}>Cancel</ThemedText>
          </Pressable>
        </View>

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search or create"
          placeholderTextColor={theme.textSecondary}
          autoCorrect={false}
          clearButtonMode="while-editing"
          style={[styles.search, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        />

        <FlatList
          data={filtered}
          keyExtractor={(e) => String(e.id)}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.four }}
          ListHeaderComponent={
            term && !exactMatch ? (
              <Pressable onPress={create} style={styles.row}>
                <ThemedText style={{ color: theme.accent, fontWeight: 600 }}>+ Create “{term}”</ThemedText>
              </Pressable>
            ) : null
          }
          ListEmptyComponent={exercises === null || error ? <Message loading={!error} error={error} /> : null}
          ItemSeparatorComponent={() => (
            <View style={[styles.separator, { backgroundColor: theme.backgroundSelected }]} />
          )}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => pick(item.name)}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.5 }]}>
              <ThemedText>{item.name}</ThemedText>
            </Pressable>
          )}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
    paddingVertical: 14,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
  },
});
