import { render, screen } from '@testing-library/react-native';

import AppTabs from '@/components/app-tabs';

// Native tabs need native code; render each trigger as its route name.
jest.mock('expo-router/unstable-native-tabs', () => {
  const { Text } = jest.requireActual('react-native');
  const Trigger = Object.assign(({ name }: { name: string }) => <Text testID="tab">{name}</Text>, {
    Label: () => null,
    Icon: () => null,
  });
  return { NativeTabs: Object.assign(({ children }: { children: any }) => <>{children}</>, { Trigger }) };
});

test('Achievements is the sixth tab, which iOS puts under More with Insights', async () => {
  await render(<AppTabs />);
  expect(screen.getAllByTestId('tab').map((t) => t.props.children)).toEqual([
    '(workout)',
    'plans',
    'history',
    'stats',
    '(insights)',
    'achievements',
  ]);
});
