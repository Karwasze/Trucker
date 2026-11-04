import type { StrengthInsights } from '@/api/types';
import type { Insight, InsightSummary } from '@/insights/insight-section';
import { strengthInsights } from '@/insights/strength-insights';

const EMPTY_STRENGTH: StrengthInsights = {
  date: '2026-10-18',
  projections: [],
  plateaus: [],
  weak_link: null,
  relative: null,
  patterns: { weekdays: [], rest_days: [] },
  interference: null,
  fatigue: [],
};

const summary = (insights: Insight[], key: string): InsightSummary => insights.find((i) => i.key === key)!.summary;
const said = (s: InsightSummary) => ('empty' in s ? s.empty : [s.headline, s.body, ...(s.details ?? [])].join('\n'));

test('gives every insight its own section, in order, even without data', () => {
  const insights = strengthInsights(EMPTY_STRENGTH, true);
  expect(insights.map((i) => i.title)).toEqual([
    'Level projections',
    'Plateaus · last 8 weeks',
    'Weak link',
    'Strength vs bodyweight',
    'Training patterns',
    'Cardio interference',
    'Fatigue within sessions',
  ]);
  expect(summary(insights, 'projections')).toEqual({ empty: expect.stringContaining('3 times over 2 weeks') });
  expect(summary(insights, 'weak-link')).toEqual({ empty: expect.stringContaining('at least two') });
  expect(summary(insights, 'fatigue')).toEqual({ empty: expect.stringContaining('2+ sets') });
  expect(summary(strengthInsights(EMPTY_STRENGTH, false), 'projections')).toEqual({
    empty: expect.stringContaining('Import your bodyweight'),
  });
});

test('projects the next level and how much the cut brings it forward', () => {
  const s = summary(
    strengthInsights(
      {
        ...EMPTY_STRENGTH,
        projections: [
          {
            exercise: 'Squat',
            level: 'novice',
            next_level: 'intermediate',
            best_1rm: 110,
            target_kg: 120,
            per_month: 3.3,
            weight_per_week: -0.5,
            days: 63,
            days_steady_weight: 98,
          },
          {
            exercise: 'Bench Press',
            level: 'novice',
            next_level: 'intermediate',
            best_1rm: 90,
            target_kg: 100,
            per_month: 0,
          },
        ],
      },
      true
    ),
    'projections'
  );
  expect(said(s)).toBe(
    [
      'At this rate: intermediate squat in about 2 months',
      'Levels are ratios to bodyweight, so the target in kg moves with your weight.',
      'Squat: intermediate (120 kg) in about 2 months at +3.3 kg/month, ~5 weeks sooner thanks to the cut',
      'Bench Press: 10 kg short of intermediate at 0 kg/month, not reached at this rate',
    ].join('\n')
  );
});

test('names stalled lifts with the diet around them', () => {
  const s = summary(
    strengthInsights(
      {
        ...EMPTY_STRENGTH,
        plateaus: [
          {
            exercise: 'Bench Press',
            status: 'flat',
            sessions: 6,
            first_date: '2026-09-10',
            last_date: '2026-10-15',
            weeks: 5,
            best_1rm: 100,
            change_pct: 0.2,
            weight_change_kg: -2.5,
            diet_logged: 30,
            diet_adhered: 24,
          },
        ],
      },
      true
    ),
    'plateaus'
  );
  expect(said(s)).toContain(
    'Bench Press flat for 5 weeks (100 kg est. 1RM) while you lost 2.5 kg · diet kept 24 of 30 days'
  );
  expect(s).toMatchObject({ headline: 'Bench Press has stalled', tone: 'warn' });
});

test('names the lagging lift', () => {
  const s = summary(
    strengthInsights(
      {
        ...EMPTY_STRENGTH,
        weak_link: {
          lagging: 'Overhead Press',
          lifts: [
            { exercise: 'Squat', best_1rm: 100, expected_kg: 90.4, balance: 0.106 },
            { exercise: 'Overhead Press', best_1rm: 30, expected_kg: 44.1, balance: -0.32 },
          ],
        },
      },
      true
    ),
    'weak-link'
  );
  expect(s).toMatchObject({
    headline: 'Overhead Press is lagging',
    body: '32% behind what your other lifts suggest, by typical ratios.',
  });
  expect(said(s)).toContain('Overhead Press: 30 kg vs 44.1 kg expected (−32%)');
});

test('gives a verdict on keeping muscle during a cut', () => {
  const s = summary(
    strengthInsights(
      {
        ...EMPTY_STRENGTH,
        relative: {
          from: '2026-09-01',
          to: '2026-10-15',
          start_weight: 84,
          end_weight: 81.9,
          weight_change_kg: -2.1,
          weight_change_pct: -2.5,
          lifts: [{ exercise: 'Squat', start_1rm: 120, end_1rm: 120.2, change_pct: 0.2, per_kg_change_pct: 2.8 }],
          verdict: 'keeping',
        },
      },
      true
    ),
    'relative'
  );
  expect(s).toMatchObject({
    headline: 'You’re likely keeping muscle',
    body: 'Down 2.1 kg since 1 Sept, squat held, so 1RM per kg of bodyweight is up 3%.',
    tone: 'good',
  });
});

test('points out the weekday skipped most and the best rest', () => {
  const s = summary(
    strengthInsights(
      {
        ...EMPTY_STRENGTH,
        patterns: {
          weekdays: [
            { weekday: 'monday', scheduled: 5, skipped: 0 },
            { weekday: 'wednesday', scheduled: 4, skipped: 3 },
          ],
          rest_days: [
            { rest: '0–1', sessions: 4, avg_change_pct: -1.5 },
            { rest: '2', sessions: 6, avg_change_pct: 2 },
            { rest: '3+', sessions: 2, avg_change_pct: 5 },
          ],
        },
      },
      true
    ),
    'patterns'
  );
  expect(s).toMatchObject({ headline: 'You skip Wednesdays most', body: 'Lifts go best after 2 rest days.' });
  expect(said(s)).toContain('Wednesdays: skipped 3 of 4');
  expect(said(s)).toContain('After 3+ rest days: +5% vs recent sessions (2 sessions)');
});

test('compares lifting after hard cardio once there are enough sessions', () => {
  const base = {
    ...EMPTY_STRENGTH,
    interference: {
      hard_sessions: 4,
      after_hard: { sessions: 2, avg_change_pct: -4 },
      fresh: { sessions: 8, avg_change_pct: 1 },
    },
  };
  expect(summary(strengthInsights(base, true), 'interference')).toMatchObject({
    headline: 'Not enough sessions to compare yet',
  });
  const enough = { ...base, interference: { ...base.interference, after_hard: { sessions: 3, avg_change_pct: -4 } } };
  expect(summary(strengthInsights(enough, true), 'interference')).toMatchObject({
    headline: 'Hard cardio costs your lifts about 5%',
    tone: 'warn',
  });
});

test('flags growing fatigue within sessions', () => {
  const s = summary(
    strengthInsights(
      {
        ...EMPTY_STRENGTH,
        fatigue: [
          { exercise: 'Squat', sessions: 6, last_date: '2026-10-16', recent_drop: 2, earlier_drop: 0, growing: true },
          {
            exercise: 'Bench Press',
            sessions: 6,
            last_date: '2026-10-15',
            recent_drop: 1,
            earlier_drop: 1,
            growing: false,
          },
        ],
      },
      true
    ),
    'fatigue'
  );
  expect(s).toMatchObject({ headline: 'Fatigue building in squat', tone: 'warn' });
  expect(said(s)).toContain('Squat: 2 reps lost first to last set, up from 0 · last 16 Oct');
  expect(said(s)).toContain('Bench Press: 1 rep lost first to last set, steady · last 15 Oct');
});
