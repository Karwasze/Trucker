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

test('five tabs, with Training plans and History sharing one, so iOS shows no More tab', async () => {
  await render(<AppTabs />);
  expect(screen.getAllByTestId('tab').map((t) => t.props.children)).toEqual([
    '(workout)',
    '(training)',
    'stats',
    '(insights)',
    'achievements',
  ]);
});
