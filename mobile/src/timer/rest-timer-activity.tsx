import { HStack, Image, ProgressView, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, frame, monospacedDigit, padding, tint } from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';

export type RestTimerActivityProps = {
  /** Unix milliseconds; props are sent as JSON, so dates travel as numbers. */
  startedAt: number;
  endsAt: number;
  /** The target as M:SS, e.g. "3:00". */
  target: string;
};

/**
 * The Lock Screen and Dynamic Island timer. SwiftUI counts up between the two
 * dates on its own and stops at the target, so the app never has to update it.
 * Runs in the isolated widget runtime: no module-scope values, hooks or state.
 */
const RestTimerActivity = (props: RestTimerActivityProps, environment: LiveActivityEnvironment) => {
  'widget';
  const accent = environment.isLuminanceReduced ? '#FFFFFF' : '#3D9BF5';
  const interval = { lower: new Date(props.startedAt), upper: new Date(props.endsAt) };

  return {
    banner: (
      <VStack spacing={10} modifiers={[padding({ all: 16 })]}>
        <HStack>
          <Image systemName="timer" color={accent} />
          <Text modifiers={[font({ weight: 'semibold' })]}>Rest</Text>
          <Spacer />
          <Text
            timerInterval={interval}
            countsDown={false}
            modifiers={[font({ size: 34, weight: 'bold' }), monospacedDigit(), foregroundStyle(accent)]}
          />
          <Text modifiers={[font({ size: 20, weight: 'semibold' }), foregroundStyle('#8E8E93')]}>
            / {props.target}
          </Text>
        </HStack>
        <ProgressView timerInterval={interval} countsDown={false} modifiers={[tint(accent)]} />
      </VStack>
    ),
    compactLeading: <Image systemName="timer" color={accent} />,
    compactTrailing: (
      <Text
        timerInterval={interval}
        countsDown={false}
        modifiers={[monospacedDigit(), foregroundStyle(accent), frame({ width: 44 })]}
      />
    ),
    minimal: <Image systemName="timer" color={accent} />,
    expandedLeading: (
      <HStack modifiers={[padding({ leading: 8 })]}>
        <Image systemName="timer" color={accent} />
        <Text>Rest</Text>
      </HStack>
    ),
    expandedTrailing: (
      <Text
        timerInterval={interval}
        countsDown={false}
        modifiers={[font({ size: 28, weight: 'bold' }), monospacedDigit(), foregroundStyle(accent)]}
      />
    ),
    expandedBottom: (
      <VStack spacing={4} modifiers={[padding({ horizontal: 8 })]}>
        <ProgressView timerInterval={interval} countsDown={false} modifiers={[tint(accent)]} />
        <Text modifiers={[font({ size: 12 }), foregroundStyle('#8E8E93')]}>Target {props.target}</Text>
      </VStack>
    ),
  };
};

export default createLiveActivity('RestTimer', RestTimerActivity);
