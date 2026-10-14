import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { localDate } from '@/api/client';

/**
 * Today's local date, rechecked when the screen gains focus, when the app
 * returns to the foreground and on `recheck`, so a screen that stays mounted
 * follows the date past midnight or a change of the device clock.
 */
export function useToday() {
  const [today, setToday] = useState(localDate);
  const recheck = useCallback(() => setToday(localDate()), []);

  useFocusEffect(recheck);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') recheck();
    });
    return () => subscription.remove();
  }, [recheck]);

  return { today, recheck };
}
