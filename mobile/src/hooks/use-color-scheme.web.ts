import { useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

const noopSubscribe = () => () => {};

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web
 */
export function useColorScheme() {
  // false during static rendering and hydration, true afterwards on the client.
  const hasHydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );

  const colorScheme = useRNColorScheme();

  if (hasHydrated) {
    return colorScheme;
  }

  return 'light';
}
