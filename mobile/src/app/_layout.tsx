import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AchievementsProvider } from '@/achievements/achievements-context';
import { SettingsProvider, useSettings } from '@/settings/settings-context';
import { TimerProvider } from '@/timer/timer-context';
import { TimerIsland } from '@/timer/timer-island';

SplashScreen.preventAutoHideAsync();

function HideSplashWhenReady() {
  const { loaded } = useSettings();
  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);
  return null;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <SettingsProvider>
          <TimerProvider>
            <AchievementsProvider>
              <HideSplashWhenReady />
              <Stack>
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="settings" options={{ title: 'Settings', headerBackButtonDisplayMode: 'minimal' }} />
                <Stack.Screen
                  name="achievements"
                  options={{ title: 'Achievements', headerBackButtonDisplayMode: 'minimal' }}
                />
                <Stack.Screen
                  name="health-import"
                  options={{ title: 'Import from Apple Health', presentation: 'modal' }}
                />
              </Stack>
              <TimerIsland />
            </AchievementsProvider>
          </TimerProvider>
        </SettingsProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
