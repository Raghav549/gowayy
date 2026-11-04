import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Photo, Money, Badge } from './UI';
import { useTheme, spacing, radius, font } from '../theme';
import type { Href } from 'expo-router';

export function ListingCard({ title, subtitle, alt, path, badge, pricePaise, href, note }: {
  title: string; subtitle: string; alt: string; path?: string; badge?: string;
  pricePaise?: number; href?: Href; note?: string;
}) {
  const { c } = useTheme();
  const router = useRouter();
  return (
    <Pressable
      onPress={() => { if (href) router.push(href); }}
      disabled={!href}
      accessibilityRole={href ? 'button' : undefined}
      style={({ pressed }) => [styles.card, { backgroundColor: c.surface, borderColor: c.border, opacity: pressed ? 0.86 : 1 }]}
    >
      <Photo path={path} alt={alt} style={styles.photo} />
      <View style={styles.body}>
        {badge ? <Badge text={badge} /> : null}
        <Text style={[styles.title, { color: c.text }]} numberOfLines={1}>{title}</Text>
        <Text style={[styles.subtitle, { color: c.textMuted }]} numberOfLines={2}>{subtitle}</Text>
        {note ? <Text style={[styles.note, { color: c.textMuted }]}>{note}</Text> : null}
        {typeof pricePaise === 'number' ? <Text style={styles.price}><Money paise={pricePaise} /></Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { width: 210, borderWidth: 1, borderRadius: radius.md, overflow: 'hidden', marginRight: spacing.md },
  photo: { height: 112, borderRadius: 0 },
  body: { padding: spacing.md, gap: 3 },
  title: { fontSize: font.sizes.base, fontWeight: '700' },
  subtitle: { fontSize: font.sizes.xs, lineHeight: 17 },
  note: { fontSize: font.sizes.xs, fontStyle: 'italic' },
  price: { fontSize: font.sizes.sm, marginTop: 3 },
});
