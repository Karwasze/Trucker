import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { ENVIRONMENT_NAMES, useSettings } from '@/settings/settings-context';

/** Shows which server the app talks to, so dev data isn't mistaken for real data. */
export function EnvironmentBadge() {
  const theme = useTheme();
  const { environment } = useSettings();
  const dev = environment === 'dev';

  return (
    <View
      accessibilityLabel={`Connected to ${ENVIRONMENT_NAMES[environment]} server`}
      style={[styles.badge, { backgroundColor: dev ? theme.warning : theme.success }]}>
      <ThemedText type="smallBold" style={{ color: dev ? '#000000' : theme.onAccent }}>
        {dev ? 'DEV' : 'PROD'}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
});
