import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, TextInput as TextInputBase } from 'react-native';
import { Image } from 'expo-image';
import { useTheme, spacing, radius, font } from '../theme';
import { imageUrl } from '../lib/client';

export function GSymbol({ size = 36 }: { size?: number }) {
  return <Image source={require('../../assets/branding/g-symbol.png')} style={{ width: size, height: size }} contentFit="contain" accessibilityLabel="GOWAYY G symbol" />;
}
export function Wordmark({ width = 150 }: { width?: number }) {
  return <Image source={require('../../assets/branding/wordmark.png')} style={{ width, height: width / 6.2 }} contentFit="contain" accessibilityLabel="GOWAYY" />;
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
export function Button({ title, onPress, variant = 'primary', disabled = false, loading = false, testID }: {
  title: string; onPress?: () => void; variant?: Variant; disabled?: boolean; loading?: boolean; testID?: string;
}) {
  const { c } = useTheme();
  const bg = variant === 'primary' ? c.accent : variant === 'danger' ? c.bg : variant === 'secondary' ? c.surfaceAlt : 'transparent';
  const fg = variant === 'primary' ? c.accentContrast : variant === 'danger' ? '#B45B4C' : c.text;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      style={({ pressed }) => [
        styles.button, { backgroundColor: bg, borderColor: variant === 'ghost' ? 'transparent' : c.border, opacity: disabled || loading ? 0.5 : pressed ? 0.85 : 1 },
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: object }) {
  const { c } = useTheme();
  return <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }, style]}>{children}</View>;
}

export function Screen({ children, scroll = true, padded = true }: { children: ReactNode; scroll?: boolean; padded?: boolean }) {
  const { c } = useTheme();
  const content = <View style={[padded ? styles.padded : undefined, styles.content]}>{children}</View>;
  return (
    <View style={[styles.screen, { backgroundColor: c.bg }]}>
      {scroll ? <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">{content}</ScrollView> : content}
    </View>
  );
}

export function SectionTitle({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={styles.sectionHead}>
      <View style={{ flex: 1 }}>
        {eyebrow ? <Text style={[styles.eyebrow, { color: c.textMuted }]}>{eyebrow.toUpperCase()}</Text> : null}
        <Text style={[styles.sectionTitle, { color: c.text }]}>{title}</Text>
      </View>
      {action}
    </View>
  );
}

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: c.text }]}>{label}</Text>
      {children}
      {hint ? <Text style={[styles.hint, { color: c.textMuted }]}>{hint}</Text> : null}
      {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
    </View>
  );
}

export function TextInput({ value, onChangeText, placeholder, secureTextEntry = false, keyboardType = 'default', autoCapitalize = 'sentences', testID, multiline = false }: {
  value: string; onChangeText: (t: string) => void; placeholder?: string; secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad'; autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  testID?: string; multiline?: boolean;
}) {
  const { c } = useTheme();
  return (
    <View style={[styles.inputWrap, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
      <TextInputBase
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={c.textMuted}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        multiline={multiline}
        style={[styles.input, { color: c.text }]}
      />
    </View>
  );
}

export function Photo({ path, alt, style }: { path?: string; alt: string; style?: object }) {
  const { c } = useTheme();
  const [failed, setFailed] = useState(false);
  if (!path || failed) {
    return (
      <View style={[styles.photo, styles.photoFallback, { backgroundColor: c.surfaceAlt, borderColor: c.border }, style]} accessibilityLabel={alt}>
        <View style={[styles.photoGlyph, { borderColor: c.border }]} />
        <Text style={[styles.photoFallbackText, { color: c.textMuted }]}>Photograph unavailable</Text>
        <Text style={[styles.photoFallbackSub, { color: c.textMuted }]}>{alt}</Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri: imageUrl(path) }}
      style={[styles.photo, style]}
      contentFit="cover"
      cachePolicy="memory-disk"
      transition={220}
      accessibilityLabel={alt}
      onError={() => setFailed(true)}
    />
  );
}

export function DemoBanner({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={[styles.banner, { backgroundColor: c.surfaceAlt, borderColor: c.accent }]}>
      <Text style={[styles.bannerText, { color: c.text }]}>{children}</Text>
    </View>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={styles.empty}>
      <Text style={[styles.emptyTitle, { color: c.text }]}>{title}</Text>
      <Text style={[styles.emptyBody, { color: c.textMuted }]}>{body}</Text>
      {action ? <View style={{ marginTop: spacing.md }}>{action}</View> : null}
    </View>
  );
}

export function Badge({ text }: { text: string }) {
  const { c } = useTheme();
  return <View style={[styles.badge, { borderColor: c.border, backgroundColor: c.surfaceAlt }]}><Text style={[styles.badgeText, { color: c.textMuted }]}>{text}</Text></View>;
}

export function Picker({ label, options, value, onChange }: {
  label: string; options: Array<{ id: string; label: string; sub?: string }>; value: string; onChange: (id: string) => void;
}) {
  const { c } = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: c.text }]}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
        {options.map((o) => (
          <Pressable key={o.id} onPress={() => onChange(o.id)} accessibilityRole="radio" accessibilityState={{ selected: value === o.id }}
            style={[styles.pickerOption, { borderColor: value === o.id ? c.accent : c.border, backgroundColor: value === o.id ? c.surfaceAlt : c.surface }]}>
            <Text style={{ color: c.text, fontSize: font.sizes.sm, fontWeight: value === o.id ? '700' : '400' }}>{o.label}</Text>
            {o.sub ? <Text style={{ color: c.textMuted, fontSize: font.sizes.xs }}>{o.sub}</Text> : null}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function Money({ paise }: { paise: number }) {
  const { c } = useTheme();
  return <Text style={{ color: c.accent, fontWeight: '600' }}>₹{(paise / 100).toFixed(2)}</Text>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  content: { flex: 1, gap: spacing.md },
  padded: { padding: spacing.lg, paddingTop: spacing.xl },
  button: { minHeight: 46, borderRadius: radius.sm, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  buttonText: { fontSize: font.sizes.base, fontWeight: '600' },
  card: { borderRadius: radius.md, borderWidth: 1, padding: spacing.lg, gap: spacing.sm },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, marginTop: spacing.md },
  eyebrow: { fontSize: font.sizes.xs, letterSpacing: 1.5, fontWeight: '600' },
  sectionTitle: { fontSize: font.sizes.xl, fontWeight: '700', marginTop: 2 },
  field: { gap: spacing.xs },
  label: { fontSize: font.sizes.sm, fontWeight: '600' },
  hint: { fontSize: font.sizes.xs },
  error: { color: '#B45B4C', fontSize: font.sizes.xs },
  inputWrap: { borderWidth: 1, borderRadius: radius.sm, minHeight: 46, justifyContent: 'center' },
  input: { paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: font.sizes.base },
  photo: { width: '100%', height: 160, borderRadius: radius.sm },
  photoFallback: { borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  photoGlyph: { width: 34, height: 34, borderWidth: 2, borderRadius: 17, transform: [{ rotate: '45deg' }], marginBottom: spacing.sm },
  photoFallbackText: { fontSize: font.sizes.sm, fontWeight: '600' },
  photoFallbackSub: { fontSize: font.sizes.xs, textAlign: 'center', paddingHorizontal: spacing.lg },
  banner: { borderWidth: 1, borderRadius: radius.sm, padding: spacing.md },
  bannerText: { fontSize: font.sizes.sm, lineHeight: 20 },
  empty: { padding: spacing.xl, alignItems: 'center', gap: spacing.sm },
  emptyTitle: { fontSize: font.sizes.lg, fontWeight: '700', textAlign: 'center' },
  emptyBody: { fontSize: font.sizes.sm, textAlign: 'center', lineHeight: 20 },
  badge: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2, alignSelf: 'flex-start' },
  badgeText: { fontSize: font.sizes.xs },
  pickerOption: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: 2 },
});
