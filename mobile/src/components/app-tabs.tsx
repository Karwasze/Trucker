import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];

  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.backgroundElement}
      labelStyle={{ selected: { color: colors.text } }}>
      <NativeTabs.Trigger name="(workout)">
        <NativeTabs.Trigger.Label>Workout</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="figure.strengthtraining.traditional" md="fitness_center" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="(training)">
        <NativeTabs.Trigger.Label>Training</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="list.bullet.clipboard" md="assignment" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="stats">
        <NativeTabs.Trigger.Label>Progress</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="chart.line.uptrend.xyaxis" md="show_chart" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="(insights)">
        <NativeTabs.Trigger.Label>Insights</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="lightbulb" md="lightbulb" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="achievements">
        <NativeTabs.Trigger.Label>Achievements</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="trophy" md="emoji_events" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
