import type { BodyInsights } from '@/api/types';
import { kg, num, plural, shortDate, type Insight, type InsightSummary } from '@/insights/insight-section';
import { formatDate } from '@/workout/format';

/** A healthy cut loses this share of bodyweight a week, in percent. */
export const LOSS_RANGE_PCT = [0.5, 1] as const;
/** Weeks losing more than this (kg) count as losing weight. */
const LOSING_KG = -0.1;
/** Days each side of a comparison needs before it says anything. */
const MIN_DAYS = 3;

/** The deeper bodyweight and diet insights, a section each, in the order of tasks.md. */
export function bodyInsights(data: BodyInsights): Insight[] {
  return [
    { key: 'rate', title: 'Rate of loss', summary: rate(data) },
    { key: 'projection', title: 'Target weight', summary: projection(data) },
    { key: 'adherence', title: 'Weight by adherence', summary: adherence(data) },
    { key: 'slips', title: 'Habits that slip together', summary: slips(data) },
  ];
}

const perWeek = (kgPerWeek: number) => `${kg(Math.abs(kgPerWeek))}/week`;

function rate({ rate: r }: BodyInsights): InsightSummary {
  if (!r) return { empty: 'Needs 3 weigh-ins over 10 or more days in the last 4 weeks.' };
  const loss = -r.per_week_pct;
  const pct = `${num(Math.abs(r.per_week_pct))}%`;
  const details = [
    `Smoothed over ${plural(r.weighins, 'weigh-in')} since ${shortDate(r.from)} · trend ${kg(r.weight)}`,
  ];
  const [low, high] = LOSS_RANGE_PCT;
  if (loss <= 0) {
    return {
      headline: r.per_week_kg === 0 ? 'Weight holding steady' : `Gaining ${perWeek(r.per_week_kg)} (${pct})`,
      body: `A cut aims for ${low}–${high}% of bodyweight a week.`,
      details,
    };
  }
  if (loss < low) {
    return {
      headline: `Losing ${perWeek(r.per_week_kg)} (${pct}): the cut is stalling`,
      body: `Below the ${low}–${high}% a week a cut aims for.`,
      details,
      tone: 'warn',
    };
  }
  if (loss > high) {
    return {
      headline: `Losing ${perWeek(r.per_week_kg)} (${pct}): too fast`,
      body: `Over ${high}% a week risks losing muscle and hurting endurance.`,
      details,
      tone: 'bad',
    };
  }
  return {
    headline: `Losing ${perWeek(r.per_week_kg)} (${pct}): on track`,
    body: `Within the ${low}–${high}% a week a cut aims for.`,
    details,
    tone: 'good',
  };
}

/** How the projected date sits against race day, e.g. ", 5 weeks before race day". */
function raceGap(date: string, race: string) {
  const days = Math.round((Date.parse(race) - Date.parse(date)) / 86_400_000);
  const weeks = Math.round(Math.abs(days) / 7);
  if (weeks === 0) return ', in race week';
  return `, ${plural(weeks, 'week')} ${days > 0 ? 'before' : 'after'} race day`;
}

function projection({ projection: p }: BodyInsights): InsightSummary {
  if (!p) return { empty: 'Set a target weight on the Diet tab to see when you’ll reach it.' };
  const target = kg(p.target_kg);
  const race = p.race_name && p.race_date ? `${p.race_name} on ${shortDate(p.race_date)}.` : undefined;
  if (p.current_kg === undefined || p.per_week_kg === undefined) {
    return { empty: `Target ${target}. Needs 3 weigh-ins over 10 or more days in the last 4 weeks to project.` };
  }
  if (p.reached) return { headline: `You’re at your ${target} target`, body: race, tone: 'good' };
  if (!p.date) {
    return {
      headline: `Not heading towards ${target}`,
      body: `Your trend is ${p.per_week_kg > 0 ? '+' : p.per_week_kg < 0 ? '−' : ''}${perWeek(p.per_week_kg)} at ${kg(p.current_kg)}.`,
      tone: 'warn',
    };
  }
  const when = formatDate(p.date, { day: 'numeric', month: 'short', year: 'numeric' });
  const gap = p.race_date ? raceGap(p.date, p.race_date) : '';
  return {
    headline: `At ${perWeek(p.per_week_kg)} you’ll reach ${target} around ${when}${gap}`,
    body: race,
    details: [`Trend ${kg(p.current_kg)} · ${kg(Math.abs(p.current_kg - p.target_kg))} to go`],
    tone: p.race_date && p.date > p.race_date ? 'warn' : 'good',
  };
}

function adherence({ adherence: groups }: BodyInsights): InsightSummary {
  if (groups.length === 0) {
    return {
      empty: 'Needs weeks with 5 or more diet days logged and weigh-ins in that week and the one before.',
    };
  }
  const details = groups.map(
    (g) =>
      `${g.group}/7 days kept: ${g.avg_change_kg > 0 ? '+' : g.avg_change_kg < 0 ? '−' : ''}${kg(Math.abs(g.avg_change_kg))} a week (${plural(g.weeks, 'week')})`
  );
  // The least strict group that still loses weight.
  const enough = [...groups].reverse().find((g) => g.avg_change_kg <= LOSING_KG);
  if (!enough) {
    return { headline: 'No group of weeks is losing weight', details, tone: 'warn' };
  }
  return {
    headline:
      enough.group === '6–7'
        ? 'Weight only drops when you keep to 6–7 days a week'
        : `Keeping to ${enough.group} days a week is enough to lose weight`,
    body: 'How strict you need to be, from weeks you’ve logged.',
    details,
    tone: 'good',
  };
}

function slips({ slips: s }: BodyInsights): InsightSummary {
  if (!s) return { empty: 'Pick a plan or race goal to set skipped training against your diet.' };
  if (s.skipped_days === 0) {
    return { headline: 'No training skipped in the last 90 days', tone: 'good' };
  }
  const details = [
    `Days you skipped training: missed the diet on ${s.skipped.missed} of ${plural(s.skipped.logged, 'day')} logged`,
    `Other days: missed it on ${s.other.missed} of ${plural(s.other.logged, 'day')} logged`,
  ];
  if (s.skipped.logged < MIN_DAYS || s.other.logged < MIN_DAYS) {
    return {
      headline: 'Not enough days to compare yet',
      body: `Needs the diet logged on ${MIN_DAYS} days you skipped training and ${MIN_DAYS} others.`,
      details,
    };
  }
  const skipped = s.skipped.missed / s.skipped.logged;
  const other = s.other.missed / s.other.logged;
  if (skipped >= 0.4 && skipped >= other * 1.5) {
    return {
      headline: `On ${Math.round(skipped * 100)}% of days you skipped training, you also missed the diet`,
      body: 'That suggests a scheduling problem rather than willpower.',
      details,
      tone: 'warn',
    };
  }
  return { headline: 'Skipped training doesn’t drag your diet down', details, tone: 'good' };
}
