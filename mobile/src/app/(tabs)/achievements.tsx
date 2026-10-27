import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  CATEGORY_NAMES,
  bestLabel,
  earnedCount,
  medal,
  tierDetail,
  tierHref,
  tierLabel,
} from '@/achievements/achievements';
import type { Achievement, AchievementTier } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { Card, Message, Screen, SectionLabel } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useQuery } from '@/hooks/use-query';
import { SettingsButton } from '@/settings/settings-button';
import { useSettings } from '@/settings/settings-context';
import { formatDate } from '@/workout/format';

const CATEGORIES = Object.keys(CATEGORY_NAMES) as Achievement['category'][];

export default function AchievementsScreen() {
  const { api, serverUrl } = useSettings();
  const achievements = useQuery(`achievements:${serverUrl}`, () => api.listAchievements());
  const list = achievements.data;

  return (
    <Screen
      title="Achievements"
      action={<SettingsButton />}
      refreshing={achievements.refreshing}
      onRefresh={achievements.refresh}>
      {!list ? (
        <Message loading={!achievements.error} error={achievements.error} />
      ) : (
        <>
          <ThemedText themeColor="textSecondary">
            {list.reduce((n, a) => n + earnedCount(a), 0)} of {list.reduce((n, a) => n + a.tiers.length, 0)} badges
            earned
          </ThemedText>
          {CATEGORIES.map((category) => (
            <View key={category} style={styles.section}>
              <SectionLabel>{CATEGORY_NAMES[category]}</SectionLabel>
              {list
                .filter((a) => a.category === category)
                .map((a) => (
                  <AchievementCard key={a.id} achievement={a} />
                ))}
            </View>
          ))}
        </>
      )}
    </Screen>
  );
}

function AchievementCard({ achievement: a }: { achievement: Achievement }) {
  const earned = earnedCount(a);
  const best = bestLabel(a);
  return (
    <Card>
      <View style={styles.row}>
        <ThemedText style={[styles.badge, earned === 0 && styles.locked]}>
          {earned > 0 ? medal(earned - 1) : '🔒'}
        </ThemedText>
        <View style={{ flex: 1 }}>
          <ThemedText type="smallBold">{a.title}</ThemedText>
          {best && (
            <ThemedText type="small" themeColor="textSecondary">
              {best}
            </ThemedText>
          )}
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {earned}/{a.tiers.length}
        </ThemedText>
      </View>
      {a.tiers.map((tier, i) => (
        <TierRow key={i} achievement={a} tier={tier} index={i} />
      ))}
    </Card>
  );
}

function TierRow({ achievement: a, tier, index }: { achievement: Achievement; tier: AchievementTier; index: number }) {
  const label = tierLabel(a, tier);
  const detail = tierDetail(a, tier);
  const href = tierHref(a, tier);
  return (
    <Pressable
      disabled={!href}
      accessibilityRole={href ? 'button' : undefined}
      accessibilityLabel={`${label}, ${tier.earned_on ? `earned ${formatDate(tier.earned_on)}` : 'not earned yet'}`}
      onPress={() => href && router.push(href)}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.5 : 1 }]}>
      <ThemedText style={[styles.medal, !tier.earned_on && styles.locked]}>{medal(index)}</ThemedText>
      <View style={{ flex: 1 }}>
        <ThemedText type="small" themeColor={tier.earned_on ? 'text' : 'textSecondary'}>
          {label}
        </ThemedText>
        {detail && (
          <ThemedText type="small" themeColor="textSecondary">
            {detail}
          </ThemedText>
        )}
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {tier.earned_on ? formatDate(tier.earned_on, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  badge: {
    fontSize: 32,
    lineHeight: 40,
  },
  medal: {
    fontSize: 20,
    lineHeight: 26,
  },
  locked: {
    opacity: 0.3,
  },
});
