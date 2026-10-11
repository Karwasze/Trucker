import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import AppTabs from '@/components/app-tabs';
import { SettingsProvider, useSettings } from '@/settings/settings-context';

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
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <SettingsProvider>
        <HideSplashWhenReady />
        <AppTabs />
      </SettingsProvider>
    </ThemeProvider>
  );
}
