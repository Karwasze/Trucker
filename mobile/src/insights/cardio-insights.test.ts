import type { CardioInsights } from '@/api/types';
import { cardioInsights } from '@/insights/cardio-insights';
import type { InsightSummary } from '@/insights/insight-section';

const EMPTY: CardioInsights = {
  date: '2026-10-18',
  efficiency: [],
  run_weight: null,
  drift: [],
  intensity: null,
  load: null,
  compliance: null,
  resting_hr: null,
  diet: null,
};

const summary = (data: Partial<CardioInsights>, key: string): InsightSummary =>
  cardioInsights({ ...EMPTY, ...data }).find((i) => i.key === key)!.summary;
const said = (s: InsightSummary) => ('empty' in s ? s.empty : [s.headline, s.body, ...(s.details ?? [])].join('\n'));

test('gives every insight its own section, in order, saying what each needs', () => {
  const insights = cardioInsights(EMPTY);
  expect(insights.map((i) => i.title)).toEqual([
    'Aerobic efficiency',
    'Run pace vs weight',
    'Cardiac drift · long sessions',
    'Intensity · last 4 weeks',
    'Load ramp',
    'Planned-session compliance',
    'Resting heart rate',
    'Cardio and your diet',
  ]);
  for (const insight of insights) expect(insight.summary).toEqual({ empty: expect.any(String) });
});

test('aerobic efficiency compares speed per beat over time', () => {
  const s = summary(
    {
      efficiency: [
        { activity: 'running', sessions: 8, first_date: '2026-09-06', last_date: '2026-10-16', start: 1.8, end: 1.872 },
        { activity: 'cycling', sessions: 3, first_date: '2026-09-10', last_date: '2026-10-12', start: 5, end: 4.9 },
      ],
    },
    'efficiency'
  );
  expect(s).toMatchObject({ headline: 'Run 4% faster at the same heart rate than on 6 Sept', tone: 'good' });
  expect(said(s)).toContain('Ride: 5 → 4.9 m per beat (−2%) · 3 sessions');
});

test('splits a run pace gain into weight and fitness', () => {
  const s = summary(
    {
      run_weight: {
        first_date: '2026-09-01',
        last_date: '2026-10-15',
        speed_change_pct: 3,
        weight_change_kg: -1.8,
        weight_change_pct: -2.2,
        weight_pct: 2.2,
        fitness_pct: 0.8,
      },
    },
    'run-weight'
  );
  expect(s).toMatchObject({
    headline: 'Pace up 3%, of which about 2.2% matches the 1.8 kg you’ve lost',
    body: 'The other 0.8% is fitness. Rule of thumb: about 1% faster for each 1% of bodyweight lost.',
  });
});

test('cardiac drift judges the latest long session against earlier ones', () => {
  const s = summary(
    {
      drift: [
        { id: 3, date: '2026-10-12', activity: 'running', duration_seconds: 5400, distance_m: 18200, drift_pct: 3.1 },
        { id: 2, date: '2026-10-05', activity: 'running', duration_seconds: 5000, distance_m: 16000, drift_pct: 6 },
        { id: 1, date: '2026-09-28', activity: 'running', duration_seconds: 4800, distance_m: 15000, drift_pct: 7 },
      ],
    },
    'drift'
  );
  expect(s).toMatchObject({
    headline: 'Your aerobic base handles 18.2 km',
    body: 'Down from 6.5% on earlier long runs: you’re ready for more distance.',
    tone: 'good',
  });
  expect(said(s)).toContain('12 Oct · Run 1:30:00, 18.2 km: 3.1% drift');
});

test('intensity flags easy days that are too hard', () => {
  const s = summary(
    {
      intensity: {
        from: '2026-09-21',
        sessions: 10,
        unmeasured: 1,
        zone_seconds: [3600, 20880, 7200, 3600, 1080],
        easy_share: 0.68,
      },
    },
    'intensity'
  );
  expect(s).toMatchObject({ headline: '68% easy. Your easy days are too hard.', tone: 'warn' });
  expect(said(s)).toContain('Zone 2: 5:48:00 (57%)');
  expect(said(s)).toContain('1 session without a heart rate left out');
});

test('load ramp warns more strongly while losing weight fast', () => {
  const base = { acute: 420, chronic_weekly: 300, ratio: 1.4, history_days: 28 };
  expect(summary({ load: base }, 'load')).toMatchObject({
    headline: 'Load up 40% on your 4-week average',
    tone: 'warn',
  });
  expect(summary({ load: { ...base, weight_per_week_kg: -0.9, weight_per_week_pct: -1.1 } }, 'load')).toMatchObject({
    headline: 'Load up 40% while losing 0.9 kg/week',
    body: 'You may not be eating enough to recover. Ease off or eat more.',
    tone: 'bad',
  });
  expect(summary({ load: { ...base, ratio: 1.1 } }, 'load')).toMatchObject({ headline: 'Load is building safely' });
});

test('compliance names the sessions missed most and those left partial', () => {
  const s = summary(
    {
      compliance: {
        goal: 'Half Ironman',
        by_kind: [
          { key: 'intervals', met: 0, partial: 3, missed: 0 },
          { key: 'long', met: 4, partial: 0, missed: 0 },
          { key: 'easy', met: 2, partial: 0, missed: 3 },
        ],
        by_activity: [
          { key: 'swimming', met: 1, partial: 0, missed: 3 },
          { key: 'running', met: 5, partial: 3, missed: 0 },
        ],
        by_weekday: [{ key: 'wednesday', met: 1, partial: 0, missed: 3 }],
      },
    },
    'compliance'
  );
  expect(s).toMatchObject({
    headline: 'You miss 3 of 4 Wednesday sessions',
    body: 'Intervals sessions often end up only partly done.',
  });
  expect(said(s)).toContain('Swim: 1 met, 0 partly, 3 missed');
});

test('resting heart rate warns 5+ bpm above baseline', () => {
  const r = { latest_date: '2026-10-18', current: 57, current_days: 7, baseline: 51, baseline_days: 30 };
  expect(summary({ resting_hr: r }, 'resting-hr')).toMatchObject({
    headline: 'Resting heart rate up 6 bpm on your baseline',
    tone: 'bad',
  });
  expect(summary({ resting_hr: { ...r, baseline: undefined, baseline_days: 4 } }, 'resting-hr')).toMatchObject({
    headline: 'Resting heart rate 57 bpm',
    body: 'Needs 10 days of readings in the 30 days before this week for a baseline; 4 so far.',
  });
});

test('diet after big sessions is compared once there are enough days', () => {
  const d = { big_sessions: 5, after_big: { logged: 4, missed: 2 }, other: { logged: 20, missed: 5 } };
  expect(summary({ diet: d }, 'diet')).toMatchObject({
    headline: 'You miss the diet 2× as often the day after a big session',
    body: 'Plan a bigger meal for those days.',
  });
  expect(summary({ diet: { ...d, after_big: { logged: 2, missed: 2 } } }, 'diet')).toMatchObject({
    headline: 'Not enough days to compare yet',
  });
});
