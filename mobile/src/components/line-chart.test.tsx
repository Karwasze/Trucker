import { render, screen } from '@testing-library/react-native';

import { LineChart } from '@/components/line-chart';
import { allOfType, layout, releaseChart, touchChart } from '@/test-utils';

const points = [
  { date: '2026-10-12', value: 80 },
  { date: '2026-10-17', value: 81.5 },
];

async function renderChart(props: Partial<Parameters<typeof LineChart>[0]> = {}) {
  await render(<LineChart points={points} from="2026-10-12" to="2026-10-18" unit="kg" {...props} />);
  const chart = screen.getByLabelText(/kg chart/);
  // 40 px of labels, 6 px padding each side, then 7 days of 10 px.
  await layout(chart, 40 + 12 + 70);
  return chart;
}

const dots = () => allOfType('RNSVGCircle').map((c) => ({ x: Number(c.props.cx), y: Number(c.props.cy) }));

test('the readout shows the latest point and its own day', async () => {
  await renderChart();
  expect(screen.getByText('81.5 kg')).toBeOnTheScreen();
  expect(screen.getByText('Latest · Sat, 17 Oct 2026')).toBeOnTheScreen();
});

test('points sit in the middle of their own day', async () => {
  await renderChart();
  // Day 0 spans 46–56 px, day 5 (Saturday) 96–106 px.
  expect(dots().map((d) => d.x)).toEqual([51, 101]);
});

test('a lone point is centred, not on an edge', async () => {
  await renderChart({ points: [{ date: '2026-10-18', value: 10.6 }], from: '2026-10-18', to: '2026-10-18' });
  const [dot] = dots();
  expect(dot.x).toBe(46 + 35);
  // Vertically it sits between the gridlines rather than on the bottom one.
  expect(dot.y).toBeGreaterThan(8 + 164 * 0.2);
  expect(dot.y).toBeLessThan(8 + 164 * 0.8);
});

test('higher values are drawn higher', async () => {
  await renderChart();
  const [first, second] = dots();
  expect(second.y).toBeLessThan(first.y);
});

test('touching reads out the nearest point until let go', async () => {
  const chart = await renderChart();
  await touchChart(chart, 60);
  expect(screen.getByText('80.0 kg')).toBeOnTheScreen();
  expect(screen.getByText('Mon, 12 Oct 2026')).toBeOnTheScreen();
  await releaseChart(chart);
  expect(screen.getByText('Latest · Sat, 17 Oct 2026')).toBeOnTheScreen();
});

test('nothing is drawn before the chart is laid out', async () => {
  await render(<LineChart points={points} from="2026-10-12" to="2026-10-18" unit="kg" />);
  expect(allOfType('RNSVGCircle')).toHaveLength(0);
  expect(screen.getByText('81.5 kg')).toBeOnTheScreen();
});
