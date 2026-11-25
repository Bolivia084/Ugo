import { type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, type TextInputProps, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { font, radius, spacing, useTheme } from '../theme/theme';

export function Screen({ children, scroll = true, padded = true }: { children: ReactNode; scroll?: boolean; padded?: boolean }) {
  const t = useTheme();
  const inner = <View style={{ padding: padded ? spacing.md : 0, gap: spacing.md }}>{children}</View>;
  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: t.colors.background }}>
      {scroll ? <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl }} keyboardShouldPersistTaps="handled">{inner}</ScrollView> : inner}
    </SafeAreaView>
  );
}

type Variant = 'title' | 'heading' | 'body' | 'muted' | 'small' | 'hero';
export function T({ children, v = 'body', color, center, style }: { children: ReactNode; v?: Variant; color?: string; center?: boolean; style?: object }) {
  const t = useTheme();
  const map: Record<Variant, object> = {
    hero: { fontSize: font.hero, fontWeight: '800', color: t.colors.text },
    title: { fontSize: font.title, fontWeight: '700', color: t.colors.text },
    heading: { fontSize: font.large, fontWeight: '700', color: t.colors.text },
    body: { fontSize: font.body, color: t.colors.text, lineHeight: 24 },
    muted: { fontSize: font.body, color: t.colors.textMuted, lineHeight: 22 },
    small: { fontSize: font.small, color: t.colors.textMuted },
  };
  return (
    <Text accessibilityRole={v === 'title' || v === 'hero' || v === 'heading' ? 'header' : 'text'} style={[map[v], color ? { color } : null, center ? { textAlign: 'center' } : null, style]}>
      {children}
    </Text>
  );
}

export function Button({ label, onPress, kind = 'primary', loading, disabled, accessibilityHint, style }: { label: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'ghost' | 'danger'; loading?: boolean; disabled?: boolean; accessibilityHint?: string; style?: ViewStyle }) {
  const t = useTheme();
  const bg = kind === 'primary' ? t.colors.primary : kind === 'danger' ? t.colors.danger : kind === 'secondary' ? t.colors.tint : 'transparent';
  const fg = kind === 'primary' ? t.colors.primaryText : kind === 'danger' ? '#FFFFFF' : t.colors.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [styles.button, { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1, borderColor: kind === 'ghost' ? t.colors.border : 'transparent' }, style]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={{ color: fg, fontSize: font.body, fontWeight: '700' }}>{label}</Text>}
    </Pressable>
  );
}

export function Card({ children, onPress, accessibilityLabel, style }: { children: ReactNode; onPress?: () => void; accessibilityLabel?: string; style?: ViewStyle }) {
  const t = useTheme();
  const base = [styles.card, { backgroundColor: t.colors.card, borderColor: t.colors.border }, style];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={({ pressed }) => [...base, { opacity: pressed ? 0.85 : 1 }]}>
      {children}
    </Pressable>
  );
}

export function Field({ label, error, ...props }: TextInputProps & { label: string; error?: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={{ color: t.colors.text, fontWeight: '600', fontSize: font.body }}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={t.colors.textMuted}
        style={[styles.input, { color: t.colors.text, borderColor: error ? t.colors.danger : t.colors.border, backgroundColor: t.colors.surface }]}
        {...props}
      />
      {error ? <Text style={{ color: t.colors.danger }}>{error}</Text> : null}
    </View>
  );
}

export function Banner({ text, tone = 'info' }: { text: string; tone?: 'info' | 'warn' | 'success' | 'error' }) {
  const t = useTheme();
  const color = tone === 'error' ? t.colors.danger : tone === 'success' ? t.colors.success : tone === 'warn' ? t.colors.gold : t.colors.primary;
  return (
    <View accessibilityRole="alert" style={[styles.banner, { borderLeftColor: color, backgroundColor: t.colors.surface }]}>
      <Text style={{ color: t.colors.text, fontSize: font.body }}>{text}</Text>
    </View>
  );
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  const t = useTheme();
  return (
    <View accessibilityLabel={label} style={{ padding: spacing.xl, alignItems: 'center' }}>
      <ActivityIndicator color={t.colors.primary} size="large" />
    </View>
  );
}

export function Row({ children, gap = spacing.sm, style }: { children: ReactNode; gap?: number; style?: ViewStyle }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap, flexWrap: 'wrap' }, style]}>{children}</View>;
}

export function Pill({ label, color }: { label: string; color?: string }) {
  const t = useTheme();
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: color ?? t.colors.tint }}>
      <Text style={{ color: color ? '#0E1630' : t.colors.primary, fontWeight: '700', fontSize: font.small }}>{label}</Text>
    </View>
  );
}

/** Horizontal bars, readable by screen readers as a list of values. */
export function Bars({ data, max = 100, suffix = '%' }: { data: { label: string; value: number }[]; max?: number; suffix?: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      {data.map((d) => (
        <View key={d.label} accessible accessibilityLabel={`${d.label}: ${d.value}${suffix}`} style={{ gap: 4 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={{ color: t.colors.text, flexShrink: 1 }}>{d.label}</Text>
            <Text style={{ color: t.colors.textMuted }}>
              {d.value}
              {suffix}
            </Text>
          </Row>
          <View style={{ height: 10, borderRadius: 5, backgroundColor: t.colors.tint }}>
            <View style={{ height: 10, borderRadius: 5, width: `${Math.max(2, Math.min(100, (d.value / max) * 100))}%`, backgroundColor: d.value / max < 0.5 ? t.colors.gold : t.colors.accent }} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Small column chart for score trends. */
export function Columns({ data, height = 120 }: { data: { label: string; value: number }[]; height?: number }) {
  const t = useTheme();
  return (
    <View accessible accessibilityLabel={`Scores over time: ${data.map((d) => `${d.label} ${d.value}%`).join(', ')}`} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height }}>
      {data.map((d, i) => (
        <View key={`${d.label}-${i}`} style={{ flex: 1, alignItems: 'center', gap: 2 }}>
          <View style={{ width: '100%', height: Math.max(4, (d.value / 100) * (height - 20)), backgroundColor: t.colors.primary, borderTopLeftRadius: 4, borderTopRightRadius: 4 }} />
          <Text style={{ color: t.colors.textMuted, fontSize: 10 }}>{d.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 50, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg, borderWidth: 1 },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.md, gap: spacing.sm },
  input: { minHeight: 50, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.md, fontSize: font.body },
  banner: { borderLeftWidth: 4, borderRadius: radius.sm, padding: spacing.md },
});
