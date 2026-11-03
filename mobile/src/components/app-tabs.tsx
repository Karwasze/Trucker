import { router, usePathname, type Href } from 'expo-router';
import { TabList, TabSlot, TabTrigger, Tabs, useTabTrigger } from 'expo-router/ui';
import { StyleSheet, View } from 'react-native';

import { CarouselTabBar, type CarouselTab } from '@/components/carousel-tab-bar';

type AppTab = CarouselTab & {
  href: Extract<Href, string>;
  /** Opens screens on top of its first one, in a stack. */
  stacked?: boolean;
};

export const TABS: AppTab[] = [
  {
    name: '(today)',
    href: '/',
    stacked: true,
    label: 'Today',
    icon: { ios: 'figure.strengthtraining.traditional', android: 'fitness_center', web: 'fitness_center' },
  },
  {
    name: 'week',
    href: '/week',
    stacked: true,
    label: 'Current week',
    icon: { ios: 'calendar', android: 'calendar_month', web: 'calendar_month' },
  },
  {
    name: 'plans',
    href: '/plans',
    stacked: true,
    label: 'Training Plan',
    icon: { ios: 'list.bullet.clipboard', android: 'assignment', web: 'assignment' },
  },
  {
    name: 'history',
    href: '/history',
    stacked: true,
    label: 'History',
    icon: { ios: 'clock.arrow.circlepath', android: 'history', web: 'history' },
  },
  {
    name: 'diet',
    href: '/diet',
    label: 'Diet',
    icon: { ios: 'fork.knife', android: 'restaurant', web: 'restaurant' },
  },
  {
    name: 'stats',
    href: '/stats',
    label: 'Progress',
    icon: { ios: 'chart.line.uptrend.xyaxis', android: 'show_chart', web: 'show_chart' },
  },
  {
    name: 'insights',
    href: '/insights',
    label: 'Insights',
    icon: { ios: 'lightbulb', android: 'lightbulb', web: 'lightbulb' },
  },
  {
    name: 'achievements',
    href: '/achievements',
    label: 'Achievements',
    icon: { ios: 'trophy', android: 'emoji_events', web: 'emoji_events' },
  },
  {
    name: 'settings',
    href: '/settings',
    label: 'Settings',
    icon: { ios: 'gearshape', android: 'settings', web: 'settings' },
  },
];

/** The carousel, switching the tabs it sits in. */
function TabBar() {
  const { switchTab, getTrigger } = useTabTrigger({ name: TABS[0].name });
  const pathname = usePathname();
  const index = Math.max(
    0,
    TABS.findIndex((tab) => getTrigger(tab.name)?.isFocused)
  );

  return (
    <CarouselTabBar
      tabs={TABS}
      index={index}
      onChange={(i) => switchTab(TABS[i].name, {})}
      // Tapping the current tab goes back to its first screen, when it's
      // deeper in.
      onReselect={(i) => {
        const { href, stacked } = TABS[i];
        const deeper = href === '/' ? pathname !== '/' : pathname.startsWith(`${href}/`);
        if (stacked && deeper) router.dismissTo(href);
      }}
    />
  );
}

/** The tab screens: only the focused one is drawn, switching at once. */
function TabPages() {
  return (
    <TabSlot
      // Tabs left stay mounted, keeping their state, but aren't drawn.
      detachInactiveScreens={false}
      renderFn={(descriptor, { isFocused, loaded }) => {
        // Screens only load once first opened.
        if (!loaded && !isFocused) return null;
        return (
          <View
            key={descriptor.route.key}
            style={[StyleSheet.absoluteFill, !isFocused && styles.hidden]}
            accessibilityElementsHidden={!isFocused}
            importantForAccessibility={isFocused ? 'auto' : 'no-hide-descendants'}>
            {descriptor.render()}
          </View>
        );
      }}
    />
  );
}

/**
 * The app's main tabs. There are more than a tab bar fits, so a swipeable
 * carousel picks between them instead; the hidden list only defines the routes.
 */
export default function AppTabs() {
  return (
    <Tabs style={{ flex: 1 }}>
      <TabPages />
      <TabList style={{ display: 'none' }}>
        {TABS.map((tab) => (
          <TabTrigger key={tab.name} name={tab.name} href={tab.href} />
        ))}
      </TabList>
      <TabBar />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  hidden: {
    display: 'none',
  },
});
