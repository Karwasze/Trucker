import { Slot } from 'expo-router';

import { ProgressProvider } from '@/progress/progress-context';

export default function ProgressLayout() {
  return (
    <ProgressProvider>
      <Slot />
    </ProgressProvider>
  );
}
