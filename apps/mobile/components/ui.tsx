import { router } from 'expo-router';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Tone } from '../lib/labels';
import { colors } from '../lib/theme';

/** Mobile counterparts of the Figma components: Button, StatusBadge, Card, Chip, Input, AppBar. */

const TONE: Record<Tone, [string, string]> = {
  neutral: [colors.brandSoft, colors.muted],
  info: [colors.infoSoft, colors.info],
  warning: [colors.warningSoft, colors.warning],
  success: [colors.successSoft, colors.success],
  danger: [colors.warningSoft, colors.danger],
};

export function Badge({ tone = 'neutral', label }: { tone?: Tone; label: string }) {
  const [bg, fg] = TONE[tone];
  return (
    <View style={[s.badge, { backgroundColor: bg }]}>
      <Text style={[s.badgeText, { color: fg }]}>{label}</Text>
    </View>
  );
}

export function Banner({ tone, text }: { tone: 'info' | 'warning' | 'success'; text: string }) {
  const [bg, fg] = TONE[tone];
  return (
    <View style={[s.banner, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontSize: 13, fontWeight: '500' }}>{text}</Text>
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Button({
  label,
  onPress,
  disabled,
  variant = 'primary',
  busy,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
  busy?: boolean;
}) {
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled || !!busy }}
      onPress={onPress}
      disabled={disabled || busy}
      style={[
        s.btn,
        primary ? s.btnPrimary : s.btnSecondary,
        (disabled || busy) && { opacity: 0.5 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={primary ? colors.brandFg : colors.ink} />
      ) : (
        <Text style={[s.btnText, { color: primary ? colors.brandFg : colors.ink }]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[s.chip, selected && s.chipOn]}
    >
      <Text style={[s.chipText, selected && { color: colors.brandFg }]}>{label}</Text>
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        style={[s.input, props.multiline && { minHeight: 110, textAlignVertical: 'top' }]}
        {...props}
      />
    </View>
  );
}

/** Screen with the AppBar from the designs: back, title, optional step/trailing text. */
export function Screen({
  title,
  trailing,
  children,
  footer,
  back = true,
}: {
  title: string;
  trailing?: string;
  children: ReactNode;
  footer?: ReactNode;
  back?: boolean;
}) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={['top', 'bottom']}>
      <View style={s.bar}>
        {back && (
          <Pressable
            accessibilityLabel="Back"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
            hitSlop={12}
          >
            <Text style={{ fontSize: 22, color: colors.ink }}>‹</Text>
          </Pressable>
        )}
        <Text style={s.barTitle} numberOfLines={1}>
          {title}
        </Text>
        {trailing ? <Text style={s.muted}>{trailing}</Text> : null}
      </View>
      {children}
      {footer ? <View style={s.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

export const s = StyleSheet.create({
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  badgeText: { fontSize: 12, fontWeight: '500' },
  banner: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  btn: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  btnPrimary: { backgroundColor: colors.brand },
  btnSecondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  btnText: { fontSize: 16, fontWeight: '600' },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontSize: 14, fontWeight: '500', color: colors.ink },
  label: { fontSize: 14, fontWeight: '500', color: colors.ink },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
  },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, height: 56 },
  barTitle: { flex: 1, fontSize: 17, fontWeight: '600', color: colors.ink },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 10,
    backgroundColor: colors.canvas,
  },
  h1: { fontSize: 22, fontWeight: '600', color: colors.ink },
  muted: { fontSize: 13, color: colors.muted },
  body: { fontSize: 15, color: colors.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  error: { color: colors.danger, fontSize: 14 },
});
