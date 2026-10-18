import { render, screen } from '@testing-library/react-native';

import { WeeklyBarChart } from '@/components/bar-chart';
import { allOfType, layout, releaseChart, touchChart } from '@/test-utils';

const weeks = [
  { week: '2026-09-28', value: 20 },
  { week: '2026-10-12', value: 45.2 },
];

async function renderChart(props: Partial<Parameters<typeof WeeklyBarChart>[0]> = {}) {
  await render(<WeeklyBarChart weeks={weeks} from="2026-09-30" to="2026-10-18" unit="km" {...props} />);
  const chart = screen.getByLabelText(/per week chart/);
  // 40 px of Y labels, then 3 weeks of 70 px each.
  await layout(chart, 40 + 210);
  return chart;
}

test('the readout names the latest week, not a day', async () => {
  await renderChart();
  expect(screen.getByText('45.2 km')).toBeOnTheScreen();
  expect(screen.getByText('Latest · Week of 12 Oct – 18 Oct')).toBeOnTheScreen();
});

test('the axis runs from the Monday of the first week to the Sunday of the last', async () => {
  await renderChart();
  expect(screen.getByText('28 Sept 26')).toBeOnTheScreen();
  expect(screen.getByText('18 Oct 26')).toBeOnTheScreen();
});

test('each bar spans its own week, and weeks without data have none', async () => {
  await renderChart();
  const bars = allOfType('RNSVGRect');
  expect(bars).toHaveLength(2);
  const span = (i: number) => {
    const { x, width } = bars[i].props;
    return [Number(x), Number(x) + Number(width)];
  };
  // Week 1 is 40–110 px, week 3 is 180–250 px; each bar sits inside its week.
  expect(span(0)[0]).toBeGreaterThan(40);
  expect(span(0)[1]).toBeLessThan(110);
  expect(span(1)[0]).toBeGreaterThan(180);
  expect(span(1)[1]).toBeLessThan(250);
});

test('bars grow from zero in proportion to their totals', async () => {
  await renderChart();
  const bars = allOfType('RNSVGRect').map((bar) => ({ top: Number(bar.props.y), height: Number(bar.props.height) }));
  expect(bars[1].height / bars[0].height).toBeCloseTo(45.2 / 20, 5);
  // Both stand on the zero line at the bottom of the 180 px plot (less 8 px padding).
  for (const bar of bars) expect(bar.top + bar.height).toBeCloseTo(172, 5);
});

test('touching a bar reads out its week until let go', async () => {
  const chart = await renderChart();
  await touchChart(chart, 60);
  expect(screen.getByText('20.0 km')).toBeOnTheScreen();
  expect(screen.getByText('Week of 28 Sept – 4 Oct')).toBeOnTheScreen();

  await releaseChart(chart);
  expect(screen.getByText('Latest · Week of 12 Oct – 18 Oct')).toBeOnTheScreen();
});

test('a custom formatter is used for the readout', async () => {
  await renderChart({ formatValue: (v) => `${Math.round(v)} kg`, unit: 'kg' });
  expect(screen.getByText('45 kg')).toBeOnTheScreen();
});
