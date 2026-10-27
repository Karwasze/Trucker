import TopTabs from 'expo-router/js-top-tabs';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/use-theme';
import { ProgressProvider } from '@/progress/progress-context';

export default function ProgressLayout() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <ProgressProvider>
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
    </ProgressProvider>
  );
}
