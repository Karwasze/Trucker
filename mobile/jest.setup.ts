// In-memory AsyncStorage, reset by the mock between tests via AsyncStorage.clear().
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Screens and hooks are rendered outside a navigator: focus effects run like
// ordinary effects, and navigation calls are recorded.
// Links navigate through the recorded router.push when their child is pressed.
// Search params come from useLocalSearchParams, a mock tests set; Stack.Screen
// options (headers) aren't rendered.
jest.mock('expo-router', () => {
  const { cloneElement, useEffect } = require('react');
  const router = {
    navigate: jest.fn(),
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    dismiss: jest.fn(),
    dismissTo: jest.fn(),
    setParams: jest.fn(),
  };
  return {
    ...jest.requireActual('expo-router'),
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
    router,
    useRouter: () => router,
    useLocalSearchParams: jest.fn(() => ({})),
    Stack: Object.assign(() => null, { Screen: () => null }),
    Link: ({ href, children }: { href: unknown; children: any }) =>
      cloneElement(children, { onPress: () => router.push(href) }),
  };
});

// The rest timer's notifications and Live Activity need native code.
jest.mock('@/timer/native', () => ({
  cancelFinishAlert: jest.fn(),
  scheduleFinishAlert: jest.fn(),
  syncLiveActivity: jest.fn(),
  vibrate: jest.fn(),
}));

// Animation and gesture libraries, per their testing guides.
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
require('react-native-reanimated').setUpTests();
require('react-native-gesture-handler/jestSetup');
