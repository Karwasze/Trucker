import type { DietInsights } from '@/api/types';
import { formatDate } from '@/workout/format';

export type DietInsight = { title: string; body: string };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const percent = (part: number, whole: number) => Math.round((part / whole) * 100);

/** What the diet's insights say, a line each, or none before anything is logged. */
export function dietInsights(insights: DietInsights): DietInsight[] {
  const { current_streak, longest_streak, recent, most_missed, bodyweight } = insights;
  const lines: DietInsight[] = [];

  if (current_streak > 0) {
    lines.push({
      title: `${current_streak}-day streak`,
      body: current_streak >= longest_streak ? 'Your longest yet.' : `Your best is ${plural(longest_streak, 'day')}.`,
    });
  } else if (longest_streak > 0) {
    lines.push({
      title: 'No streak going',
      body: `Your best is ${plural(longest_streak, 'day')}. Keep to it today to start a new one.`,
    });
  }

  if (recent.logged > 0) {
    const unlogged = recent.days - recent.logged;
    lines.push({
      title: `Kept to ${recent.adhered} of ${plural(recent.logged, 'day')} logged`,
      body: `${percent(recent.adhered, recent.logged)}% over the last ${recent.days} days${unlogged > 0 ? `, with ${plural(unlogged, 'day')} not logged` : ''}.`,
    });
  }

  if (most_missed) {
    const weekday = `${capitalize(most_missed.weekday)}s`;
    lines.push({
      title: `${weekday} slip most`,
      body: `Missed ${most_missed.missed} of the last ${plural(most_missed.logged, weekday.slice(0, -1))} logged. Worth planning ahead for.`,
    });
  }

  if (bodyweight) {
    const change = Math.abs(bodyweight.change_kg);
    const title =
      bodyweight.change_kg === 0
        ? 'Bodyweight steady'
        : `${bodyweight.change_kg < 0 ? 'Down' : 'Up'} ${change.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg`;
    const adherence =
      recent.logged > 0 ? `, keeping to your diet ${percent(recent.adhered, recent.logged)}% of days` : '';
    lines.push({
      title,
      body: `Since ${formatDate(bodyweight.from, { day: 'numeric', month: 'short' })}${adherence}.`,
    });
  }

  return lines;
}
