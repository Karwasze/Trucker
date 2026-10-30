import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type PressableProps,
  type ViewProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EnvironmentBadge } from '@/components/environment-badge';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ScreenProps = {
  title?: string;
  subtitle?: string;
  /** Shown at the trailing end of the title row. */
  action?: ReactNode;
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Set when a native stack header already handles the top inset. */
  hasHeader?: boolean;
  /** Room for controls floating above the tab bar, so the content scrolls clear of them. */
  bottomInset?: number;
};

/** Scrollable tab screen with a large title and safe-area padding. */
export function Screen({
  title,
  subtitle,
  action,
  children,
  refreshing,
  onRefresh,
  hasHeader,
  bottomInset = 0,
}: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentInsetAdjustmentBehavior={hasHeader ? 'automatic' : 'never'}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      automaticallyAdjustKeyboardInsets
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: hasHeader ? Spacing.three : insets.top + Spacing.three,
          paddingBottom: insets.bottom + BottomTabInset + bottomInset + Spacing.four,
        },
      ]}>
      {title && (
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <ThemedText style={styles.title}>{title}</ThemedText>
            <EnvironmentBadge />
            {action && <View style={styles.action}>{action}</View>}
          </View>
          {subtitle && <ThemedText themeColor="textSecondary">{subtitle}</ThemedText>}
        </View>
      )}
      {children}
    </ScrollView>
  );
}

export function Card({ style, ...rest }: ViewProps) {
  const theme = useTheme();
  return <View style={[styles.card, { backgroundColor: theme.backgroundElement }, style]} {...rest} />;
}

type ButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  title: string;
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  compact?: boolean;
};

export function Button({ title, variant = 'primary', loading, compact, disabled, ...rest }: ButtonProps) {
  const theme = useTheme();
  const background = {
    primary: theme.accent,
    secondary: theme.backgroundSelected,
    danger: theme.danger,
  }[variant];
  const color = variant === 'secondary' ? theme.text : theme.onAccent;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        { backgroundColor: background, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
      ]}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <ThemedText type={compact ? 'smallBold' : 'default'} style={{ color, fontWeight: 600 }}>
          {title}
        </ThemedText>
      )}
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  variant = 'primary',
  inCard,
  accessibilityLabel,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** A secondary chip is selected with a tint instead of a solid fill. */
  variant?: 'primary' | 'secondary';
  /** Set when placed on a Card, which shares the unselected chip color. */
  inCard?: boolean;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  const secondary = selected && variant === 'secondary';
  const background = !selected
    ? inCard
      ? theme.backgroundSelected
      : theme.backgroundElement
    : secondary
      ? `${theme.accent}33`
      : theme.accent;
  const color = !selected ? theme.text : secondary ? theme.accent : theme.onAccent;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={[styles.chip, { backgroundColor: background }]}>
      <ThemedText type="small" style={{ color }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

/** Centered message for loading, empty and error states. */
export function Message({
  loading,
  error,
  children,
}: {
  loading?: boolean;
  error?: string | null;
  children?: ReactNode;
}) {
  const theme = useTheme();
  if (loading) return <ActivityIndicator style={styles.message} />;
  return (
    <View style={styles.message}>
      <ThemedText style={{ textAlign: 'center', color: error ? theme.danger : theme.textSecondary }}>
        {error ?? children}
      </ThemedText>
    </View>
  );
}

/** A text button for a native stack header, e.g. Save or Cancel. */
export function HeaderButton({
  title,
  onPress,
  disabled,
  bold,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  bold?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={10} disabled={disabled}>
      <ThemedText style={{ color: theme.accent, fontWeight: bold ? 700 : 500 }}>{title}</ThemedText>
    </Pressable>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionLabel}>
      {children}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.three,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  header: {
    gap: Spacing.one,
    marginBottom: Spacing.two,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  action: {
    marginLeft: 'auto',
  },
  title: {
    flexShrink: 1,
    fontSize: 34,
    lineHeight: 41,
    fontWeight: 700,
  },
  card: {
    borderRadius: 16,
    borderCurve: 'continuous',
    padding: Spacing.three,
    gap: Spacing.two,
  },
  button: {
    minHeight: 50,
    borderRadius: 14,
    borderCurve: 'continuous',
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonCompact: {
    minHeight: 36,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: Spacing.two,
    borderRadius: 999,
  },
  message: {
    paddingVertical: Spacing.five,
    alignItems: 'center',
  },
  sectionLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: Spacing.two,
  },
});
