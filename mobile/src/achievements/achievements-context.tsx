import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { createContext, use, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal, StyleSheet, View } from 'react-native';

import { earnedKeys, medal, tierDetail, tierKey, tierLabel } from '@/achievements/achievements';
import type { Achievement } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { Button, Card } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useSettings } from '@/settings/settings-context';

/** The earned tiers already shown, per server, so only new ones are celebrated. */
const SEEN_KEY = 'trucker.achievements.seen';

/** A newly earned tier: the highest one of its achievement. */
type Unlocked = { achievement: Achievement; tier: number };

type AchievementsState = {
  /** Looks for tiers earned since the last check and celebrates them. */
  check: () => void;
};

// Without a provider (e.g. a screen rendered on its own) checking does nothing.
const AchievementsContext = createContext<AchievementsState>({ check: () => {} });

export const useAchievements = () => use(AchievementsContext);

/**
 * Celebrates achievements as they are earned. The first check on a server
 * only remembers what is earned already, so a new install doesn't celebrate
 * everything done before.
 */
export function AchievementsProvider({ children }: { children: ReactNode }) {
  const { api, serverUrl, loaded } = useSettings();
  const [unlocked, setUnlocked] = useState<Unlocked[]>([]);
  // Checks run one after another, so two at once don't both celebrate a tier.
  const queue = useRef(Promise.resolve());

  const check = useCallback(() => {
    if (!serverUrl) return;
    const key = `${SEEN_KEY}:${serverUrl}`;
    queue.current = queue.current
      .then(async () => {
        const [list, raw] = await Promise.all([api.listAchievements(), AsyncStorage.getItem(key)]);
        const earned = earnedKeys(list);
        const seen = raw ? new Set<string>(JSON.parse(raw)) : null;
        const fresh = seen ? earned.filter((k) => !seen.has(k)) : earned;
        if (fresh.length === 0) return;
        await AsyncStorage.setItem(key, JSON.stringify([...(seen ?? []), ...fresh]));
        if (!seen) return;
        const found = list.flatMap((achievement) => {
          const tiers = achievement.tiers.map((_, i) => i).filter((i) => fresh.includes(tierKey(achievement, i)));
          return tiers.length > 0 ? [{ achievement, tier: Math.max(...tiers) }] : [];
        });
        setUnlocked((u) => [...u, ...found]);
      })
      .catch(() => {});
  }, [api, serverUrl]);

  useEffect(() => {
    if (loaded) check();
  }, [loaded, check]);

  const close = () => setUnlocked([]);

  return (
    <AchievementsContext value={{ check }}>
      {children}
      <Modal visible={unlocked.length > 0} transparent animationType="fade" onRequestClose={close}>
        <View style={styles.backdrop}>
          <Card style={styles.sheet}>
            <ThemedText style={styles.trophy}>🏆</ThemedText>
            <ThemedText type="subtitle" style={styles.center}>
              {unlocked.length === 1 ? 'Achievement unlocked' : 'Achievements unlocked'}
            </ThemedText>
            {unlocked.map(({ achievement: a, tier }) => {
              const detail = tierDetail(a, a.tiers[tier]);
              return (
                <View key={tierKey(a, tier)} style={styles.row}>
                  <ThemedText style={styles.medal}>{medal(tier)}</ThemedText>
                  <View style={{ flex: 1 }}>
                    <ThemedText type="smallBold">{a.title}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {tierLabel(a, a.tiers[tier])}
                      {detail ? ` · ${detail}` : ''}
                    </ThemedText>
                  </View>
                </View>
              );
            })}
            <Button title="Nice!" onPress={close} />
            <Button
              title="See all achievements"
              variant="secondary"
              onPress={() => {
                close();
                router.push('/achievements');
              }}
            />
          </Card>
        </View>
      </Modal>
    </AchievementsContext>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.four,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    gap: Spacing.three,
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  trophy: {
    fontSize: 56,
    lineHeight: 68,
    textAlign: 'center',
  },
  center: {
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  medal: {
    fontSize: 32,
    lineHeight: 40,
  },
});
