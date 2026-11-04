import type { StrengthInsights, StrengthProjection } from '@/api/types';
import {
  aboutDays,
  capitalize,
  kg,
  num,
  plural,
  shortDate,
  signedKg,
  signedPct,
  type Insight,
  type InsightSummary,
} from '@/insights/insight-section';

/** Sessions each side of a comparison needs before it says anything. */
export const MIN_COMPARED = 3;

/** The deeper lifting insights, a section each, in the order of tasks.md. */
export function strengthInsights(data: StrengthInsights, hasBodyweight: boolean): Insight[] {
  return [
    { key: 'projections', title: 'Level projections', summary: projections(data, hasBodyweight) },
    { key: 'plateaus', title: 'Plateaus · last 8 weeks', summary: plateaus(data) },
    { key: 'weak-link', title: 'Weak link', summary: weakLink(data) },
    { key: 'relative', title: 'Strength vs bodyweight', summary: relative(data) },
    { key: 'patterns', title: 'Training patterns', summary: patterns(data) },
    { key: 'interference', title: 'Cardio interference', summary: interference(data) },
    { key: 'fatigue', title: 'Fatigue within sessions', summary: fatigue(data) },
  ];
}

/** How much sooner (or later) the weight trend brings a level, e.g. ", ~5 weeks sooner thanks to the cut". */
function weightEffect(p: StrengthProjection) {
  if (p.weight_per_week === undefined || p.weight_per_week === 0) return '';
  if (p.days !== undefined && p.days_steady_weight === undefined) return ', only within reach thanks to the cut';
  if (p.days === undefined || p.days_steady_weight === undefined) return '';
  const weeks = Math.round((p.days_steady_weight - p.days) / 7);
  if (weeks >= 1) return `, ~${plural(weeks, 'week')} sooner thanks to the cut`;
  if (weeks <= -1) return `, ~${plural(-weeks, 'week')} later as your weight rises`;
  return '';
}

function projections({ projections: ps }: StrengthInsights, hasBodyweight: boolean): InsightSummary {
  if (!hasBodyweight) return { empty: 'Import your bodyweight to project when your lifts reach the next level.' };
  if (ps.length === 0) {
    return {
      empty:
        'Train a squat, bench press, deadlift, overhead press or Romanian deadlift 3 times over 2 weeks in this timespan to project its next level.',
    };
  }
  const details = ps.map((p) => {
    const rate = `${signedKg(p.per_month)}/month`;
    if (p.days === undefined) {
      return `${p.exercise}: ${kg(p.target_kg - p.best_1rm)} short of ${p.next_level} at ${rate}, not reached at this rate`;
    }
    return `${p.exercise}: ${p.next_level} (${kg(p.target_kg)}) in ${aboutDays(p.days)} at ${rate}${weightEffect(p)}`;
  });
  const soonest = ps
    .filter((p) => p.days !== undefined)
    .sort((a, b) => a.days! - b.days!)
    .at(0);
  if (!soonest) return { headline: 'No lift is on course for its next level', details, tone: 'warn' };
  return {
    headline: `At this rate: ${soonest.next_level} ${soonest.exercise.toLowerCase()} in ${aboutDays(soonest.days!)}`,
    body: 'Levels are ratios to bodyweight, so the target in kg moves with your weight.',
    details,
    tone: 'good',
  };
}

function plateaus({ plateaus: ps }: StrengthInsights): InsightSummary {
  if (ps.length === 0) {
    return {
      headline: 'No lift has gone flat',
      body: 'Every lift trained 4+ times over the last 8 weeks is still rising.',
      tone: 'good',
    };
  }
  const details = ps.map((p) => {
    const trend =
      p.status === 'flat'
        ? `flat for ${plural(p.weeks, 'week')}`
        : `down ${num(-p.change_pct)}% over ${plural(p.weeks, 'week')}`;
    const context: string[] = [];
    if (p.weight_change_kg !== undefined) {
      const w = p.weight_change_kg;
      context.push(w < 0 ? `while you lost ${kg(-w)}` : w > 0 ? `while you gained ${kg(w)}` : 'at a steady weight');
    }
    if (p.diet_logged > 0) context.push(`diet kept ${p.diet_adhered} of ${plural(p.diet_logged, 'day')}`);
    return `${p.exercise} ${trend} (${kg(p.best_1rm)} est. 1RM)${context.length > 0 ? ` ${context.join(' · ')}` : ''}`;
  });
  return {
    headline: ps.length === 1 ? `${ps[0].exercise} has stalled` : `${ps.length} lifts have stalled`,
    details,
    tone: 'warn',
  };
}

function weakLink({ weak_link: link }: StrengthInsights): InsightSummary {
  if (!link) return { empty: 'Log at least two of squat, bench press, deadlift and overhead press to compare them.' };
  const details = link.lifts.map(
    (l) =>
      `${l.exercise}: ${kg(l.best_1rm)} vs ${kg(l.expected_kg)} expected (${signedPct(Math.round(l.balance * 100))})`
  );
  const lagging = link.lifts.find((l) => l.exercise === link.lagging);
  if (!lagging) {
    return {
      headline: 'Your lifts are in balance',
      body: 'Each is within 10% of what the others suggest (deadlift ≈ 1.2× squat, bench ≈ 0.75× squat, press ≈ 0.65× bench).',
      details,
      tone: 'good',
    };
  }
  return {
    headline: `${lagging.exercise} is lagging`,
    body: `${Math.round(-lagging.balance * 100)}% behind what your other lifts suggest, by typical ratios.`,
    details,
    tone: 'warn',
  };
}

const VERDICTS = {
  keeping: { headline: 'You’re likely keeping muscle', tone: 'good' },
  mixed: { headline: 'Strength is slipping a little', tone: 'warn' },
  too_aggressive: { headline: 'The deficit may be too aggressive', tone: 'bad' },
  not_cutting: { headline: 'Not cutting', tone: undefined },
} as const;

function relative({ relative: r }: StrengthInsights): InsightSummary {
  if (!r) return { empty: 'Needs two weigh-ins at least a week apart in this timespan.' };
  if (!r.verdict) return { empty: 'Train a main lift twice in this timespan to set it against your bodyweight.' };
  const weight =
    r.weight_change_kg === 0
      ? `Weight steady since ${shortDate(r.from)}`
      : `${r.weight_change_kg < 0 ? 'Down' : 'Up'} ${kg(Math.abs(r.weight_change_kg))} since ${shortDate(r.from)}`;
  const lifts = r.lifts.map((l) => {
    const held = Math.abs(l.change_pct) < 1 ? 'held' : l.change_pct > 0 ? 'up' : 'down';
    return `${l.exercise.toLowerCase()} ${held}`;
  });
  const avgPerKg = r.lifts.reduce((sum, l) => sum + l.per_kg_change_pct, 0) / r.lifts.length;
  const { headline, tone } = VERDICTS[r.verdict];
  return {
    headline,
    body: `${weight}, ${lifts.join(', ')}, so 1RM per kg of bodyweight is ${avgPerKg >= 0 ? 'up' : 'down'} ${num(Math.abs(avgPerKg), 0)}%.`,
    details: r.lifts.map(
      (l) =>
        `${l.exercise}: ${kg(l.start_1rm)} → ${kg(l.end_1rm)} (${signedPct(l.change_pct)}) · per kg ${signedPct(l.per_kg_change_pct)}`
    ),
    tone,
  };
}

function patterns({ patterns: p }: StrengthInsights): InsightSummary {
  if (p.weekdays.length === 0 && p.rest_days.length === 0) {
    return { empty: 'Pick a plan or race goal, and train a lift more than once, to see when you train best.' };
  }
  const details: string[] = [];
  const worst = p.weekdays
    .filter((d) => d.scheduled >= 2 && d.skipped > 0)
    .sort((a, b) => b.skipped / b.scheduled - a.skipped / a.scheduled || b.skipped - a.skipped)
    .at(0);
  for (const d of p.weekdays) {
    details.push(`${capitalize(d.weekday)}s: skipped ${d.skipped} of ${d.scheduled}`);
  }
  for (const r of p.rest_days) {
    details.push(
      `After ${r.rest} rest days: ${signedPct(r.avg_change_pct)} vs recent sessions (${plural(r.sessions, 'session')})`
    );
  }
  const best = p.rest_days
    .filter((r) => r.sessions >= MIN_COMPARED)
    .sort((a, b) => b.avg_change_pct - a.avg_change_pct)
    .at(0);
  const headline = worst
    ? `You skip ${capitalize(worst.weekday)}s most`
    : best
      ? `Lifts go best after ${best.rest} rest days`
      : 'No clear pattern yet';
  const body = worst && best ? `Lifts go best after ${best.rest} rest days.` : undefined;
  return { headline, body, details, tone: worst ? 'warn' : undefined };
}

function interference({ interference: ci }: StrengthInsights): InsightSummary {
  if (!ci) {
    return {
      empty:
        'No hard cardio in this timespan. Hard means 90+ minutes, 20+ minutes in zones 4–5, or your top quarter of sessions by load.',
    };
  }
  const details = [
    `Within a day of hard cardio: ${signedPct(ci.after_hard.avg_change_pct)} (${plural(ci.after_hard.sessions, 'session')})`,
    `Fresh: ${signedPct(ci.fresh.avg_change_pct)} (${plural(ci.fresh.sessions, 'session')})`,
  ];
  if (ci.after_hard.sessions < MIN_COMPARED || ci.fresh.sessions < MIN_COMPARED) {
    return {
      headline: 'Not enough sessions to compare yet',
      body: `Needs ${MIN_COMPARED} lifting sessions both after hard cardio and fresh. ${plural(ci.hard_sessions, 'hard session')} so far.`,
      details,
    };
  }
  const gap = ci.after_hard.avg_change_pct - ci.fresh.avg_change_pct;
  return {
    headline: gap <= -2 ? `Hard cardio costs your lifts about ${num(-gap, 0)}%` : 'Cardio isn’t hurting your lifting',
    body: 'Each lifting session’s best est. 1RM against the average of the lift’s previous three.',
    details,
    tone: gap <= -2 ? 'warn' : 'good',
  };
}

function fatigue({ fatigue: fs }: StrengthInsights): InsightSummary {
  if (fs.length === 0) {
    return { empty: 'Log 4 sessions of a lift with 2+ sets at its top weight in this timespan to track fatigue.' };
  }
  const growing = fs.filter((f) => f.growing);
  const details = fs.map(
    (f) =>
      `${f.exercise}: ${plural(f.recent_drop, 'rep')} lost first to last set, ${f.growing ? `up from ${num(f.earlier_drop)}` : 'steady'} · last ${shortDate(f.last_date)}`
  );
  if (growing.length === 0) {
    return {
      headline: 'No fatigue building up',
      body: 'Rep drops across sets are holding steady.',
      details,
      tone: 'good',
    };
  }
  return {
    headline: `Fatigue building in ${growing.map((f) => f.exercise.toLowerCase()).join(', ')}`,
    body: 'A growing drop from first to last set often comes before a stall. Consider a lighter week.',
    details,
    tone: 'warn',
  };
}
