import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { createApi } from '@/api/client';
import type { TrainingPlan } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Message, Screen, SectionLabel } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useQuery } from '@/hooks/use-query';
import { useTheme } from '@/hooks/use-theme';
import { useSettings } from '@/settings/settings-context';

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const scheduleOf = (plan: TrainingPlan) =>
  [...plan.days]
    .sort((a, b) => WEEKDAYS.indexOf(a.weekday) - WEEKDAYS.indexOf(b.weekday))
    .map((d) => d.weekday.slice(0, 3).replace(/^./, (c) => c.toUpperCase()))
    .join(' · ');

export default function SettingsScreen() {
  const theme = useTheme();
  const { api, serverUrl, planId, update } = useSettings();
  const [urlInput, setUrlInput] = useState(serverUrl);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const plans = useQuery(`plans:${serverUrl}`, api.listPlans);

  const saveAndTest = async () => {
    const url = urlInput.trim().replace(/\/+$/, '');
    setUrlInput(url);
    setTesting(true);
    setStatus(null);
    try {
      const exercises = await createApi(url).listExercises();
      setStatus({ ok: true, text: `Connected · ${exercises.length} exercises` });
    } catch (e) {
      setStatus({ ok: false, text: (e as Error).message });
    } finally {
      setTesting(false);
      if (url !== serverUrl) update({ serverUrl: url, planId: null });
    }
  };

  return (
    <Screen title="Settings" refreshing={plans.refreshing} onRefresh={plans.refresh}>
      <SectionLabel>Server</SectionLabel>
      <Card>
        <TextInput
          value={urlInput}
          onChangeText={setUrlInput}
          onSubmitEditing={saveAndTest}
          placeholder="http://192.168.1.10:8081"
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="done"
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundSelected }]}
        />
        {status && (
          <ThemedText type="small" style={{ color: status.ok ? theme.success : theme.danger }}>
            {status.text}
          </ThemedText>
        )}
        <Button
          title={urlInput.trim() === serverUrl ? 'Test connection' : 'Save & test'}
          variant="secondary"
          compact
          loading={testing}
          onPress={saveAndTest}
        />
      </Card>

      <SectionLabel>Training plan</SectionLabel>
      {!plans.data ? (
        <Message loading={!plans.error} error={plans.error} />
      ) : (
        <Card style={{ gap: 0, paddingVertical: Spacing.one }}>
          <PlanOption
            title="No plan"
            detail="Log workouts freely"
            selected={planId === null}
            onPress={() => update({ planId: null })}
          />
          {plans.data.map((plan) => (
            <PlanOption
              key={plan.id}
              title={plan.name}
              detail={scheduleOf(plan) || 'No days scheduled'}
              selected={plan.id === planId}
              onPress={() => update({ planId: plan.id })}
            />
          ))}
        </Card>
      )}
    </Screen>
  );
}

function PlanOption({
  title,
  detail,
  selected,
  onPress,
}: {
  title: string;
  detail: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={({ pressed }) => [styles.option, pressed && { opacity: 0.6 }]}>
      <View style={{ flex: 1 }}>
        <ThemedText style={{ fontWeight: 600 }}>{title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {detail}
        </ThemedText>
      </View>
      {selected && <ThemedText style={{ color: theme.accent, fontWeight: 700, fontSize: 18 }}>✓</ThemedText>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  input: {
    height: 44,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.two + 2,
    gap: Spacing.two,
  },
});
