/** Light-themed primitives for GOWAYY EXPLORE (Android). */
import { Pressable, ScrollView, Text, TextInput as RNInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, font, radius, spacing } from '../theme';

export function Screen({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={[{ padding: spacing.lg, gap: spacing.lg }, style]}>
      {children}
    </ScrollView>
  );
}
export function H1({ children }: { children: React.ReactNode }) {
  return <Text style={{ fontSize: font.sizes['2xl'], fontWeight: font.display, color: colors.text }}>{children}</Text>;
}
export function H2({ children }: { children: React.ReactNode }) {
  return <Text style={{ fontSize: font.sizes.lg, fontWeight: font.semibold, color: colors.text }}>{children}</Text>;
}
export function Body({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return <Text style={{ fontSize: font.sizes.base, color: muted ? colors.textMuted : colors.text }}>{children}</Text>;
}
export function Card({ children, onPress, style }: { children: React.ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle> }) {
  const inner = (
    <View style={[{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.xs }, style]}>
      {children}
    </View>
  );
  if (!onPress) return inner;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
      {inner}
    </Pressable>
  );
}
export function Button({ label, onPress, variant = 'primary', disabled }: { label: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'ghost'; disabled?: boolean }) {
  const bg = variant === 'primary' ? colors.accent : variant === 'secondary' ? colors.surfaceAlt : 'transparent';
  const fg = variant === 'primary' ? colors.accentContrast : colors.text;
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button"
      style={({ pressed }) => ({
        backgroundColor: bg, borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
        alignItems: 'center', opacity: disabled ? 0.5 : pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.97 : 1 }],
        borderWidth: variant === 'secondary' ? 1 : 0, borderColor: colors.border,
      })}>
      <Text style={{ color: fg, fontWeight: font.semibold }}>{label}</Text>
    </Pressable>
  );
}
export function Input({ label, value, onChangeText, placeholder, secure }: { label: string; value: string; onChangeText: (t: string) => void; placeholder?: string; secure?: boolean }) {
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={{ fontSize: font.sizes.sm, color: colors.textMuted, fontWeight: font.medium }}>{label}</Text>
      <RNInput value={value} onChangeText={onChangeText} placeholder={placeholder} secureTextEntry={secure} placeholderTextColor={colors.textMuted}
        style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, color: colors.text }} />
    </View>
  );
}
export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <Card style={{ alignItems: 'center' }}>
      <H2>{title}</H2>
      <Body muted>{body}</Body>
    </Card>
  );
}
