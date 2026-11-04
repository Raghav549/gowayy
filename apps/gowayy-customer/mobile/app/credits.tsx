import { Pressable, StyleSheet, Text } from 'react-native';
import { Linking } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { client } from '../src/lib/client';
import { Card, Screen, SectionTitle } from '../src/components/UI';
import { useTheme, font, spacing } from '../src/theme';

export default function CreditsScreen() {
  const { c } = useTheme();
  const credits = useQuery({ queryKey: ['credits'], queryFn: () => client.credits() });
  return (
    <Screen>
      <SectionTitle eyebrow="Provenance" title="Photograph credits" />
      <Card><Text style={{ color: c.text, fontSize: font.sizes.sm, lineHeight: 21 }}>{credits.data?.policy ?? 'Loading licensing policy…'}</Text></Card>
      {(credits.data?.credits ?? []).map((cr, i) => (
        <Card key={`${cr.place}-${i}`}>
          <Text style={{ color: c.text, fontWeight: '700' }}>{cr.place}</Text>
          <Text style={{ color: c.textMuted, fontSize: font.sizes.xs }}>{cr.alt}</Text>
          {cr.credit ? <Text style={{ color: c.textMuted, fontSize: font.sizes.xs }}>Credit: {cr.credit}</Text> : null}
          {cr.license ? <Text style={{ color: c.textMuted, fontSize: font.sizes.xs }}>Licence: {cr.license}</Text> : null}
          {cr.sourceUrl ? <Pressable onPress={() => void Linking.openURL(cr.sourceUrl!)}><Text style={{ color: c.accent, fontSize: font.sizes.xs }}>{cr.sourceUrl}</Text></Pressable> : null}
        </Card>
      ))}
      <SectionTitle eyebrow="Integrity" title="Unavailable photographs" />
      <Card><Text style={{ color: c.textMuted, fontSize: font.sizes.sm, lineHeight: 20 }}>
        GOWAYY never substitutes an unrelated or AI-generated image for a real place. Records without a verified, permissibly licensed exact-place photograph show a designed "photograph unavailable" state.
      </Text></Card>
      {(credits.data?.unavailablePlaces ?? []).map((p) => <Text key={p} style={{ color: c.textMuted, fontSize: font.sizes.sm }}>· {p}</Text>)}
      <Text style={styles.foot}>Full attribution: assets/images/ATTRIBUTION.md · docs/LICENSING.md</Text>
    </Screen>
  );
}
const styles = StyleSheet.create({ foot: { color: '#6F6876', fontSize: font.sizes.xs, marginTop: spacing.lg, marginBottom: spacing.xl } });
