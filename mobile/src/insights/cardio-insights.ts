import type { CardioActivity, CardioInsights, ComplianceGroup } from '@/api/types';
import {
  capitalize,
  kg,
  num,
  plural,
  shortDate,
  signedPct,
  type Insight,
  type InsightSummary,
} from '@/insights/insight-section';
import { ACTIVITY_NAMES, formatDistance, formatDuration } from '@/workout/format';

/** Activities by what a session of each is called in a sentence. */
const SESSIONS: Record<CardioActivity, string> = {
  running: 'runs',
  cycling: 'rides',
  swimming: 'swims',
  walking: 'walks',
  hiking: 'hikes',
};

/** Drift under this share on a long session means the aerobic base copes with it. */
export const DRIFT_OK_PCT = 5;
/** The share of time in zones 1–2 an 80/20 split aims for, with a little slack. */
export const EASY_TARGET = 0.75;
/** A week's load over this many times the 4-week average ramps too fast. */
export const LOAD_RAMP_LIMIT = 1.3;
/** Losing this share of bodyweight a week is fast. */
export const FAST_LOSS_PCT = 0.75;
/** A resting heart rate this far above baseline is an early warning. */
export const RESTING_RISE_BPM = 5;
/** Groups and days compared need this many before they say anything. */
const MIN_COUNT = 3;

/** The deeper endurance insights, a section each, in the order of tasks.md. */
export function cardioInsights(data: CardioInsights): Insight[] {
  return [
    { key: 'efficiency', title: 'Aerobic efficiency', summary: efficiency(data) },
    { key: 'run-weight', title: 'Run pace vs weight', summary: runWeight(data) },
    { key: 'drift', title: 'Cardiac drift · long sessions', summary: drift(data) },
    { key: 'intensity', title: 'Intensity · last 4 weeks', summary: intensity(data) },
    { key: 'load', title: 'Load ramp', summary: load(data) },
    { key: 'compliance', title: 'Planned-session compliance', summary: compliance(data) },
    { key: 'resting-hr', title: 'Resting heart rate', summary: restingHR(data) },
    { key: 'diet', title: 'Cardio and your diet', summary: diet(data) },
  ];
}

function efficiency({ efficiency: es }: CardioInsights): InsightSummary {
  if (es.length === 0) {
    return {
      empty:
        'Needs 3 sessions of an activity with a distance and heart rate in this timespan, and your resting heart rate from Apple Health.',
    };
  }
  const change = (e: (typeof es)[number]) => (e.end / e.start - 1) * 100;
  const main = [...es].sort((a, b) => b.sessions - a.sessions)[0];
  const pct = Math.round(change(main));
  const headline =
    pct === 0
      ? `${ACTIVITY_NAMES[main.activity]} efficiency steady since ${shortDate(main.first_date)}`
      : `${ACTIVITY_NAMES[main.activity]} ${Math.abs(pct)}% ${pct > 0 ? 'faster' : 'slower'} at the same heart rate than on ${shortDate(main.first_date)}`;
  return {
    headline,
    body: 'Speed per heartbeat above resting shows fitness gains that pace hides when you go easy on purpose.',
    details: es.map(
      (e) =>
        `${ACTIVITY_NAMES[e.activity]}: ${num(e.start, 2)} → ${num(e.end, 2)} m per beat (${signedPct(Math.round(change(e)))}) · ${plural(e.sessions, 'session')}`
    ),
    tone: pct > 0 ? 'good' : pct < 0 ? 'warn' : undefined,
  };
}

function runWeight({ run_weight: r }: CardioInsights): InsightSummary {
  if (!r) return { empty: 'Needs 3 runs with a distance in this timespan and weigh-ins around the first and last.' };
  const pace = `Pace ${r.speed_change_pct >= 0 ? 'up' : 'down'} ${num(Math.abs(r.speed_change_pct))}%`;
  if (r.weight_change_kg >= 0) {
    return {
      headline: pace,
      body: `Your weight ${r.weight_change_kg === 0 ? 'held' : `rose ${kg(r.weight_change_kg)}`}, so all of it is fitness.`,
      tone: r.speed_change_pct > 0 ? 'good' : undefined,
    };
  }
  return {
    headline: `${pace}, of which about ${num(r.weight_pct)}% matches the ${kg(-r.weight_change_kg)} you’ve lost`,
    body: `The other ${num(r.fitness_pct)}% is fitness. Rule of thumb: about 1% faster for each 1% of bodyweight lost.`,
    details: [`${shortDate(r.first_date)} → ${shortDate(r.last_date)}`],
    tone: r.fitness_pct > 0 ? 'good' : 'warn',
  };
}

function drift({ drift: ds }: CardioInsights): InsightSummary {
  if (ds.length === 0) {
    return { empty: 'Needs a run or ride of an hour or more with heart rate samples in this timespan.' };
  }
  const latest = ds[0];
  const earlier = ds.slice(1).filter((d) => d.activity === latest.activity);
  const average = earlier.reduce((sum, d) => sum + d.drift_pct, 0) / earlier.length;
  const distance =
    latest.distance_m > 0
      ? formatDistance(latest.distance_m, latest.activity)
      : formatDuration(latest.duration_seconds);
  const ok = latest.drift_pct < DRIFT_OK_PCT;
  const comparison =
    earlier.length === 0
      ? `Under ${DRIFT_OK_PCT}% means your aerobic base handles the distance.`
      : latest.drift_pct < average
        ? `Down from ${num(average)}% on earlier long ${SESSIONS[latest.activity]}: you’re ready for more distance.`
        : `Up from ${num(average)}% on earlier long ${SESSIONS[latest.activity]}.`;
  const body = latest.even_pace
    ? `${comparison} Assumes you held an even pace, as no distance was recorded.`
    : comparison;
  // Sessions without a recorded distance are judged on heart rate alone.
  const assumed = (d: (typeof ds)[number]) => (d.even_pace ? ` (${d.indoor ? 'indoor, ' : ''}even pace assumed)` : '');
  return {
    headline: ok
      ? `Your aerobic base handles ${distance}`
      : `Heart rate drifted ${num(latest.drift_pct)}% on your last long ${ACTIVITY_NAMES[latest.activity].toLowerCase()}`,
    body,
    details: ds.map(
      (d) =>
        `${shortDate(d.date)} · ${ACTIVITY_NAMES[d.activity]} ${formatDuration(d.duration_seconds)}${d.distance_m > 0 ? `, ${formatDistance(d.distance_m, d.activity)}` : ''}: ${num(d.drift_pct)}% drift${assumed(d)}`
    ),
    tone: ok ? 'good' : 'warn',
  };
}

function intensity({ intensity: i }: CardioInsights): InsightSummary {
  if (!i) return { empty: 'Needs heart rate zones. Connect Apple Health in Settings to import them.' };
  const total = i.zone_seconds.reduce((sum, s) => sum + s, 0);
  if (i.sessions === 0 || total === 0) {
    return { empty: 'No cardio with a heart rate in the last 4 weeks.' };
  }
  const easy = Math.round(i.easy_share * 100);
  const details = i.zone_seconds.map(
    (s, zone) => `Zone ${zone + 1}: ${formatDuration(s)} (${Math.round((s / total) * 100)}%)`
  );
  if (i.unmeasured > 0) details.push(`${plural(i.unmeasured, 'session')} without a heart rate left out`);
  return i.easy_share >= EASY_TARGET
    ? {
        headline: `${easy}% easy: on track for 80/20`,
        body: 'Time in zones 1–2 against zones 3–5.',
        details,
        tone: 'good',
      }
    : {
        headline: `${easy}% easy. Your easy days are too hard.`,
        body: 'Aim for about 80% of your time in zones 1–2.',
        details,
        tone: 'warn',
      };
}

function load({ load: l }: CardioInsights): InsightSummary {
  if (!l) return { empty: 'No cardio in the last 4 weeks.' };
  const details = [
    `Last 7 days: ${num(l.acute, 0)} · 4-week weekly average: ${num(l.chronic_weekly, 0)} · ratio ${num(l.ratio, 2)}`,
  ];
  if (l.weight_per_week_kg !== undefined) {
    details.push(`Bodyweight ${l.weight_per_week_kg <= 0 ? '−' : '+'}${kg(Math.abs(l.weight_per_week_kg))}/week`);
  }
  if (l.history_days < 28) {
    details.push(`Only ${plural(l.history_days, 'day')} of cardio so far, so the average is still settling.`);
  }
  if (l.ratio <= LOAD_RAMP_LIMIT) {
    return {
      headline: 'Load is building safely',
      body: `This week is within ${Math.round((LOAD_RAMP_LIMIT - 1) * 100)}% of your 4-week average.`,
      details,
      tone: 'good',
    };
  }
  const up = `Load up ${Math.round((l.ratio - 1) * 100)}%`;
  const losingFast = l.weight_per_week_pct !== undefined && -l.weight_per_week_pct >= FAST_LOSS_PCT;
  if (losingFast) {
    return {
      headline: `${up} while losing ${kg(-l.weight_per_week_kg!)}/week`,
      body: 'You may not be eating enough to recover. Ease off or eat more.',
      details,
      tone: 'bad',
    };
  }
  return {
    headline: `${up} on your 4-week average`,
    body: 'Ramping this fast raises the risk of injury and illness.',
    details,
    tone: 'warn',
  };
}

const total = (g: ComplianceGroup) => g.met + g.partial + g.missed;

function compliance({ compliance: c }: CardioInsights): InsightSummary {
  if (!c) return { empty: 'Set a race goal under Training to see which planned sessions you miss.' };
  if (c.by_kind.length === 0) return { empty: `No ${c.goal} sessions judged in this timespan yet.` };

  const labelled = [
    ...c.by_weekday.map((g) => ({ g, label: `${capitalize(g.key)} sessions` })),
    ...c.by_activity.map((g) => ({ g, label: SESSIONS[g.key as CardioActivity] ?? `${g.key} sessions` })),
    ...c.by_kind.map((g) => ({ g, label: `${g.key} sessions` })),
  ];
  const worst = labelled
    .filter(({ g }) => total(g) >= MIN_COUNT && g.missed > 0)
    .sort((a, b) => b.g.missed / total(b.g) - a.g.missed / total(a.g))
    .at(0);
  const partly = labelled
    .filter(({ g }) => total(g) >= MIN_COUNT && g.partial * 2 >= total(g))
    .sort((a, b) => b.g.partial / total(b.g) - a.g.partial / total(a.g))
    .at(0);
  const line = (g: ComplianceGroup, label: string) =>
    `${capitalize(label)}: ${g.met} met, ${g.partial} partly, ${g.missed} missed`;
  const details = [
    ...c.by_kind.map((g) => line(g, `${g.key}`)),
    ...c.by_activity.map((g) => line(g, ACTIVITY_NAMES[g.key as CardioActivity] ?? g.key)),
    ...c.by_weekday.map((g) => line(g, `${g.key}s`)),
  ];
  const body = partly ? `${capitalize(partly.label)} often end up only partly done.` : undefined;
  if (worst && worst.g.missed * 2 >= total(worst.g)) {
    return {
      headline: `You miss ${worst.g.missed} of ${total(worst.g)} ${worst.label}`,
      body,
      details,
      tone: 'warn',
    };
  }
  return { headline: 'You keep to most planned sessions', body, details, tone: partly ? undefined : 'good' };
}

function restingHR({ resting_hr: r }: CardioInsights): InsightSummary {
  if (!r) {
    return {
      empty: 'Needs a resting heart rate from Apple Health in the last week. It syncs when you check for imports.',
    };
  }
  const now = `${num(r.current, 0)} bpm over the last ${plural(r.current_days, 'day')}`;
  if (r.baseline === undefined) {
    return {
      headline: `Resting heart rate ${num(r.current, 0)} bpm`,
      body: `Needs 10 days of readings in the 30 days before this week for a baseline; ${r.baseline_days} so far.`,
    };
  }
  const change = r.current - r.baseline;
  const details = [now, `Baseline ${num(r.baseline, 0)} bpm over ${plural(r.baseline_days, 'day')}`];
  if (change >= RESTING_RISE_BPM) {
    return {
      headline: `Resting heart rate up ${num(change, 0)} bpm on your baseline`,
      body: 'An early sign of fatigue or illness. Consider an easy day or two.',
      details,
      tone: 'bad',
    };
  }
  return {
    headline:
      Math.round(change) === 0
        ? 'Resting heart rate steady'
        : `Resting heart rate ${change > 0 ? 'up' : 'down'} ${num(Math.abs(change), 0)} bpm on your baseline`,
    body: `Within ${RESTING_RISE_BPM} bpm of your 30-day baseline.`,
    details,
    tone: 'good',
  };
}

function diet({ diet: d }: CardioInsights): InsightSummary {
  if (!d) return { empty: 'Log your diet on the Diet tab to compare it with your cardio.' };
  const rate = (c: { logged: number; missed: number }) => (c.logged > 0 ? c.missed / c.logged : 0);
  const details = [
    `Day after a big session: missed ${d.after_big.missed} of ${plural(d.after_big.logged, 'day')}`,
    `Other days: missed ${d.other.missed} of ${plural(d.other.logged, 'day')}`,
  ];
  if (d.after_big.logged < MIN_COUNT || d.other.logged < MIN_COUNT) {
    return {
      headline: 'Not enough days to compare yet',
      body: `Needs ${MIN_COUNT} diet days logged after a big session (90+ minutes or 1000+ kcal) and ${MIN_COUNT} others. ${plural(d.big_sessions, 'big session')} so far.`,
      details,
    };
  }
  const after = rate(d.after_big);
  const other = rate(d.other);
  if (after > 0 && (other === 0 || after / other >= 1.5)) {
    return {
      headline:
        other === 0
          ? 'You only miss the diet the day after a big session'
          : `You miss the diet ${num(after / other)}× as often the day after a big session`,
      body: 'Plan a bigger meal for those days.',
      details,
      tone: 'warn',
    };
  }
  return { headline: 'Big sessions don’t throw off your diet', details, tone: 'good' };
}
