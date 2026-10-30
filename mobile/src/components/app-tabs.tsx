import { router, usePathname, type Href } from 'expo-router';
import { TabList, TabSlot, TabTrigger, Tabs, useTabTrigger } from 'expo-router/ui';

import { CarouselTabBar, type CarouselTab } from '@/components/carousel-tab-bar';
import { PagerPage, usePager } from '@/components/page-transition';

type AppTab = CarouselTab & {
  href: Extract<Href, string>;
  /** Opens screens on top of its first one, in a stack. */
  stacked?: boolean;
};

export const TABS: AppTab[] = [
  {
    name: '(today)',
    href: '/',
    label: 'Today',
    icon: { ios: 'figure.strengthtraining.traditional', android: 'fitness_center', web: 'fitness_center' },
  },
  {
    name: 'week',
    href: '/week',
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
        if (stacked && pathname.startsWith(`${href}/`)) router.dismissTo(href);
      }}
    />
  );
}

/** The tab screens, sliding past each other as the carousel turns. */
function TabPages() {
  const { getTrigger } = useTabTrigger({ name: TABS[0].name });
  const index = Math.max(
    0,
    TABS.findIndex((tab) => getTrigger(tab.name)?.isFocused)
  );
  const pager = usePager(index, TABS.length, true);

  return (
    <TabSlot
      // The pages are all laid out; the pager hides the ones out of sight.
      detachInactiveScreens={false}
      renderFn={(descriptor, { isFocused, loaded }) => {
        // Screens only load once first opened.
        if (!loaded && !isFocused) return null;
        // A tab's route can be named after its first screen, e.g. "(today)/index".
        const page = TABS.findIndex((tab) => getTrigger(tab.name)?.route.key === descriptor.route.key);
        return (
          <PagerPage key={descriptor.route.key} pager={pager} index={page}>
            {descriptor.render()}
          </PagerPage>
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
