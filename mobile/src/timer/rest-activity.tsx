import { HStack, Image, ProgressView, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, frame, monospacedDigit, padding, tint } from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';

export type RestActivityProps = {
  /** Wall-clock times in ms, as in RunningTimer. */
  startedAt: number;
  endsAt: number;
};

/**
 * The rest timer on the lock screen and in the Dynamic Island. The clock and
 * bar are SwiftUI timers, so they tick without the app running; once the end
 * passes (the activity's stale date) it switches to a finished look.
 *
 * Runs in the widget extension: nothing outside this function is in scope.
 */
const RestActivity = (props: RestActivityProps, environment: LiveActivityEnvironment) => {
  'widget';
  const color = environment.isStale ? '#3FBF73' : '#FF5A45';
  const interval = { lower: new Date(props.startedAt), upper: new Date(props.endsAt) };
  const total = Math.round((props.endsAt - props.startedAt) / 1000);
  const target = `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;

  const icon = (size: number) => (
    <Image systemName={environment.isStale ? 'checkmark.circle.fill' : 'timer'} size={size} color={color} />
  );
  const clock = (size: number) => (
    <Text
      timerInterval={interval}
      countsDown={false}
      modifiers={[font({ size, weight: 'semibold', design: 'rounded' }), monospacedDigit(), foregroundStyle(color)]}
    />
  );
  const bar = <ProgressView timerInterval={interval} countsDown={false} modifiers={[tint(color)]} />;
  const label = (
    <VStack alignment="leading" spacing={0}>
      <Text modifiers={[font({ size: 15, weight: 'semibold' })]}>{environment.isStale ? 'Rest over' : 'Rest'}</Text>
      <Text modifiers={[font({ size: 13 }), foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
        {`of ${target}`}
      </Text>
    </VStack>
  );

  return {
    banner: (
      <VStack spacing={10} modifiers={[padding({ all: 16 })]}>
        <HStack spacing={10}>
          {icon(24)}
          {label}
          <Spacer />
          {clock(34)}
        </HStack>
        {bar}
      </VStack>
    ),
    compactLeading: icon(15),
    compactTrailing: (
      <Text
        timerInterval={interval}
        countsDown={false}
        modifiers={[
          font({ size: 15, weight: 'semibold', design: 'rounded' }),
          monospacedDigit(),
          foregroundStyle(color),
          frame({ maxWidth: 44 }),
        ]}
      />
    ),
    minimal: icon(15),
    expandedLeading: (
      <HStack spacing={8} modifiers={[padding({ leading: 4 })]}>
        {icon(20)}
        {label}
      </HStack>
    ),
    expandedTrailing: clock(30),
    expandedBottom: <VStack modifiers={[padding({ horizontal: 4, top: 4 })]}>{bar}</VStack>,
  };
};

export default createLiveActivity('RestActivity', RestActivity);
