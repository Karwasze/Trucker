import type { BodyInsights } from '@/api/types';
import { bodyInsights } from '@/insights/body-insights';
import type { InsightSummary } from '@/insights/insight-section';

const EMPTY: BodyInsights = { date: '2026-10-18', rate: null, projection: null, adherence: [], slips: null };

const summary = (data: Partial<BodyInsights>, key: string): InsightSummary =>
  bodyInsights({ ...EMPTY, ...data }).find((i) => i.key === key)!.summary;
const said = (s: InsightSummary) => ('empty' in s ? s.empty : [s.headline, s.body, ...(s.details ?? [])].join('\n'));

const rate = { from: '2026-09-21', to: '2026-10-17', weighins: 12, weight: 82, per_week_kg: -0.5, per_week_pct: -0.61 };

test('gives every insight its own section, in order, saying what each needs', () => {
  const insights = bodyInsights(EMPTY);
  expect(insights.map((i) => i.title)).toEqual([
    'Rate of loss',
    'Target weight',
    'Weight by adherence',
    'Habits that slip together',
  ]);
  for (const insight of insights) expect(insight.summary).toEqual({ empty: expect.any(String) });
});

test('judges the rate of loss against 0.5–1% a week', () => {
  expect(summary({ rate }, 'rate')).toMatchObject({ headline: 'Losing 0.5 kg/week (0.6%): on track', tone: 'good' });
  expect(summary({ rate: { ...rate, per_week_kg: -0.2, per_week_pct: -0.24 } }, 'rate')).toMatchObject({
    headline: 'Losing 0.2 kg/week (0.2%): the cut is stalling',
    tone: 'warn',
  });
  expect(summary({ rate: { ...rate, per_week_kg: -1, per_week_pct: -1.22 } }, 'rate')).toMatchObject({
    headline: 'Losing 1 kg/week (1.2%): too fast',
    body: 'Over 1% a week risks losing muscle and hurting endurance.',
    tone: 'bad',
  });
  expect(said(summary({ rate }, 'rate'))).toContain('Smoothed over 12 weigh-ins since 21 Sept · trend 82 kg');
});

test('projects the target weight against race day', () => {
  const s = summary(
    {
      projection: {
        target_kg: 78,
        current_kg: 82,
        per_week_kg: -0.4,
        date: '2027-01-12',
        race_name: 'Half Ironman',
        race_date: '2027-02-16',
      },
    },
    'projection'
  );
  expect(s).toMatchObject({
    headline: 'At 0.4 kg/week you’ll reach 78 kg around 12 Jan 2027, 5 weeks before race day',
    body: 'Half Ironman on 16 Feb.',
    tone: 'good',
  });
  expect(summary({ projection: { target_kg: 78 } }, 'projection')).toEqual({
    empty: 'Target 78 kg. Needs 3 weigh-ins over 10 or more days in the last 4 weeks to project.',
  });
  expect(summary({ projection: { target_kg: 78, current_kg: 80, per_week_kg: 0.2 } }, 'projection')).toMatchObject({
    headline: 'Not heading towards 78 kg',
    body: 'Your trend is +0.2 kg/week at 80 kg.',
  });
});

test('says how strict the diet needs to be', () => {
  const s = summary(
    {
      adherence: [
        { group: '6–7', weeks: 6, avg_change_kg: -0.6 },
        { group: '4–5', weeks: 4, avg_change_kg: -0.1 },
        { group: '0–3', weeks: 2, avg_change_kg: 0.3 },
      ],
    },
    'adherence'
  );
  expect(s).toMatchObject({ headline: 'Keeping to 4–5 days a week is enough to lose weight' });
  expect(said(s)).toContain('6–7/7 days kept: −0.6 kg a week (6 weeks)');
  expect(said(s)).toContain('0–3/7 days kept: +0.3 kg a week (2 weeks)');
});

test('links diet misses to skipped training', () => {
  const s = summary(
    { slips: { skipped_days: 12, skipped: { logged: 10, missed: 7 }, other: { logged: 50, missed: 10 } } },
    'slips'
  );
  expect(s).toMatchObject({
    headline: 'On 70% of days you skipped training, you also missed the diet',
    body: 'That suggests a scheduling problem rather than willpower.',
  });
  expect(
    summary({ slips: { skipped_days: 0, skipped: { logged: 0, missed: 0 }, other: { logged: 9, missed: 1 } } }, 'slips')
  ).toMatchObject({
    headline: 'No training skipped in the last 90 days',
  });
});
