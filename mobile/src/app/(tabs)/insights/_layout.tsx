import TopTabs from 'expo-router/js-top-tabs';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/use-theme';
import { InsightsProvider } from '@/insights/insights-view';

export default function InsightsLayout() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <InsightsProvider>
      <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: theme.background }}>
        <TopTabs
          screenOptions={{
            tabBarStyle: { backgroundColor: theme.background },
            tabBarActiveTintColor: theme.text,
            tabBarInactiveTintColor: theme.textSecondary,
            tabBarIndicatorStyle: { backgroundColor: theme.accent },
            tabBarLabelStyle: { fontWeight: '600', textTransform: 'none' },
            sceneStyle: { backgroundColor: theme.background },
          }}>
          <TopTabs.Screen name="index" options={{ title: 'Strength' }} />
          <TopTabs.Screen name="cardio" options={{ title: 'Cardio' }} />
        </TopTabs>
      </View>
    </InsightsProvider>
  );
}
