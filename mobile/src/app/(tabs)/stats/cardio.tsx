import { useState } from 'react';

import type { CardioActivity } from '@/api/types';
import { Message, Screen } from '@/components/ui';
import { useQuery } from '@/hooks/use-query';
import { CardioStats } from '@/progress/cardio-stats';
import { useOpenedWith, useProgressTimespan } from '@/progress/progress-context';
import { SeriesPicker, type Series } from '@/progress/series-picker';
import { TriathlonStats } from '@/progress/triathlon-stats';
import { SettingsButton } from '@/settings/settings-button';
import { useSettings } from '@/settings/settings-context';

/** The second Progress page: each cardio activity's workouts, and triathlons. */
export default function CardioProgressScreen() {
  const { api, serverUrl } = useSettings();
  const [selected, setSelected] = useState<Series | null>(null);
  const { timespan, setTimespan } = useProgressTimespan();
  // Oldest first, for the charts.
  const cardio = useQuery(`cardio:${serverUrl}`, async () => (await api.listCardio()).reverse());
  const triathlons = useQuery(`triathlons:${serverUrl}`, async () => (await api.listTriathlons()).reverse());
  // Opened on an activity or triathlons from elsewhere, e.g. Insights.
  useOpenedWith((params) =>
    setSelected(
      params.activity ? { kind: 'cardio', activity: params.activity as CardioActivity } : { kind: 'triathlon' }
    )
  );

  const workouts = cardio.data ?? [];
  const activities = [...new Set(workouts.map((w) => w.activity))] as CardioActivity[];
  const hasTriathlons = (triathlons.data ?? []).length > 0;
  // Default to the activity done last.
  const latest = workouts.at(-1);
  const fallback: Series | null = latest ? { kind: 'cardio', activity: latest.activity } : null;
  const series =
    (selected?.kind === 'triathlon' && hasTriathlons) ||
    (selected?.kind === 'cardio' && activities.includes(selected.activity))
      ? selected
      : fallback;

  return (
    <Screen
      title="Cardio"
      subtitle="Your runs, rides, swims and triathlons over time"
      action={<SettingsButton />}
      hasHeader
      refreshing={cardio.refreshing}
      onRefresh={() => {
        cardio.refresh();
        triathlons.refresh();
      }}>
      {!cardio.data ? (
        <Message loading={!cardio.error} error={cardio.error} />
      ) : !series ? (
        <Message>No cardio workouts yet. Connect Apple Health in Settings to import them.</Message>
      ) : (
        <>
          <SeriesPicker
            value={series}
            exercises={[]}
            activities={activities}
            triathlon={hasTriathlons}
            bodyweight={false}
            onChange={setSelected}
          />
          {series.kind === 'triathlon' ? (
            <TriathlonStats triathlons={triathlons.data ?? []} timespan={timespan} onTimespanChange={setTimespan} />
          ) : (
            series.kind === 'cardio' && (
              <CardioStats
                activity={series.activity}
                workouts={workouts.filter((w) => w.activity === series.activity)}
                timespan={timespan}
                onTimespanChange={setTimespan}
              />
            )
          )}
        </>
      )}
    </Screen>
  );
}
