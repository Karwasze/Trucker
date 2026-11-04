import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card, SectionLabel } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { formatDate } from '@/workout/format';

/**
 * What an insight says: a headline with an optional body and a line per
 * detail, coloured by how good the news is, or, without enough data yet,
 * what it still needs.
 */
export type InsightSummary =
  { headline: string; body?: string; details?: string[]; tone?: 'good' | 'warn' | 'bad' } | { empty: string };

/** An insight with its own section, so each can be found and reviewed on its own. */
export type Insight = { key: string; title: string; summary: InsightSummary };

const TONES = { good: 'success', warn: 'warning', bad: 'danger' } as const;

export function InsightSection({ insight: { title, summary } }: { insight: Insight }) {
  return (
    <>
      <SectionLabel>{title}</SectionLabel>
      <Card>
        {'empty' in summary ? (
          <ThemedText type="small" themeColor="textSecondary">
            {summary.empty}
          </ThemedText>
        ) : (
          <>
            <ThemedText type="smallBold" themeColor={summary.tone ? TONES[summary.tone] : 'text'}>
              {summary.headline}
            </ThemedText>
            {summary.body && (
              <ThemedText type="small" themeColor="textSecondary">
                {summary.body}
              </ThemedText>
            )}
            {summary.details && summary.details.length > 0 && (
              <View style={{ gap: Spacing.half }}>
                {summary.details.map((line) => (
                  <ThemedText key={line} type="small">
                    {line}
                  </ThemedText>
                ))}
              </View>
            )}
          </>
        )}
      </Card>
    </>
  );
}

export function InsightSections({ insights }: { insights: Insight[] }) {
  return insights.map((insight) => <InsightSection key={insight.key} insight={insight} />);
}

// Formatting shared by the insights' text.

export const plural = (n: number, word: string, words = `${word}s`) => `${n} ${n === 1 ? word : words}`;
export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** A number with at most one decimal. */
export const num = (n: number, decimals = 1) => n.toLocaleString('en-GB', { maximumFractionDigits: decimals });
export const kg = (n: number) => `${num(n)} kg`;
/** A signed percentage, e.g. "+3%" or "−2.5%". */
export const signedPct = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${num(Math.abs(n))}%`;
/** A signed weight, e.g. "+0.4 kg" or "−1.2 kg". */
export const signedKg = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${kg(Math.abs(n))}`;
export const shortDate = (date: string) => formatDate(date, { day: 'numeric', month: 'short' });
/** About how long `days` is: days under two weeks, weeks under two months, else months. */
export function aboutDays(days: number) {
  if (days < 14) return plural(Math.max(1, Math.round(days)), 'day');
  if (days < 60) return `about ${plural(Math.round(days / 7), 'week')}`;
  return `about ${plural(Math.round(days / 30.44), 'month')}`;
}
