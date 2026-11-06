import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { client } from '../../src/lib/client';
import { useJourney } from '../../src/store/useJourney';
import { useUI } from '../../src/store/useUI';
import { Button, Card, Field, Photo, Screen, SectionTitle, TextInput } from '../../src/components/UI';
import { ListingCard } from '../../src/components/Cards';
import { openNavigationHandoff } from '../../src/lib/location';
import { useTheme, spacing, radius, font } from '../../src/theme';

export default function ExploreScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string; gem?: string }>();
  const { c } = useTheme();
  const showToast = useUI((s) => s.showToast);
  const patchJourney = useJourney((s) => s.patch);
  const [query, setQuery] = useState(params.q ?? '');
  const catalog = useQuery({ queryKey: ['catalog'], queryFn: () => client.catalog(), staleTime: 5 * 60_000 });
  const hits = useQuery({ queryKey: ['search', query], queryFn: () => client.search(query), enabled: query.trim().length > 1 });
  const data = catalog.data;
  const filtered = useMemo(() => (data?.destinations ?? []).filter((d) => !query || d.name.toLowerCase().includes(query.toLowerCase())), [data, query]);
  const gem = data?.hiddenGems.find((g) => g.id === params.gem);

  return (
    <Screen>
      <Field label="Universal search"><TextInput value={query} onChangeText={setQuery} placeholder="Destinations, hotels, food, attractions…" autoCapitalize="none" testID="explore-search" /></Field>
      {query.trim().length > 1 ? <Card>
        {hits.isLoading ? <Skeleton height={20} /> : null}
        {hits.data?.slice(0, 8).map((h) => (
          <Pressable key={`${h.kind}-${h.id}`} onPress={() => {
            if (h.kind === 'destination') router.push({ pathname: '/destinations/[slug]', params: { slug: h.id.replace(/^dst_/, '') } });
            else router.push({ pathname: '/explore', params: { q: h.title } });
          }} style={styles.hit}>
            <Ionicons name="search-outline" size={15} color={c.textMuted} />
            <View style={{ flex: 1 }}><Text style={{ color: c.text }}>{h.title}</Text><Text style={{ color: c.textMuted, fontSize: font.sizes.xs }}>{h.subtitle}</Text></View>
            <Text style={{ color: c.accent, fontSize: font.sizes.xs }}>{h.kind}</Text>
          </Pressable>
        ))}
        {hits.data?.length === 0 ? <Text style={{ color: c.textMuted }}>No matches. Try another name or service.</Text> : null}
      </Card> : null}

      {gem ? <Card>
        <Text style={[styles.eyebrow, { color: c.accent }]}>HIDDEN GEM · APPROXIMATE COORDINATES</Text>
        <Text style={[styles.title, { color: c.text }]}>{gem.name}</Text>
        <Text style={styles.line}><Text style={{ color: c.text, fontWeight: '600' }}>Route: </Text><Text style={{ color: c.textMuted }}>{gem.route}</Text></Text>
        <Text style={styles.line}><Text style={{ color: c.text, fontWeight: '600' }}>Accessibility: </Text><Text style={{ color: c.textMuted }}>{gem.accessibility}</Text></Text>
        <Text style={styles.line}><Text style={{ color: c.text, fontWeight: '600' }}>Best period: </Text><Text style={{ color: c.textMuted }}>{gem.bestPeriod}</Text></Text>
        <Text style={styles.line}><Text style={{ color: c.text, fontWeight: '600' }}>Local guidance: </Text><Text style={{ color: c.textMuted }}>{gem.localTravelGuidance}</Text></Text>
        <Text style={styles.line}><Text style={{ color: c.text, fontWeight: '600' }}>Restrictions: </Text><Text style={{ color: c.textMuted }}>{gem.restrictions}</Text></Text>
        <Text style={styles.line}><Text style={{ color: c.text, fontWeight: '600' }}>Safety: </Text><Text style={{ color: c.textMuted }}>{gem.safetyWarnings}</Text></Text>
        <Text style={{ color: c.textMuted, fontSize: font.sizes.xs }}>Source: {gem.source} · {gem.infoStatus}</Text>
        <Button title="Navigation handoff" variant="secondary" onPress={() => void openNavigationHandoff(null, gem.coords)} />
      </Card> : null}

      <SectionTitle eyebrow="Destinations" title={`${filtered.length} places`} />
      {filtered.map((d) => (
        <Pressable key={d.id} onPress={() => {
          void patchJourney({ destinationId: d.id, dropoff: { name: d.name, lat: d.coords.lat, lng: d.coords.lng } });
          router.push({ pathname: '/destinations/[slug]', params: { slug: d.slug } });
        }} style={[styles.dest, { borderColor: c.border, backgroundColor: c.surface }]}>
          <Photo path={d.images.find((i) => i.status === 'verified')?.assetPath} alt={d.images[0]?.alt ?? `${d.name} photograph`} style={styles.destPhoto} />
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={{ color: c.text, fontWeight: '700' }}>{d.name}</Text>
            <Text style={{ color: c.textMuted, fontSize: font.sizes.xs }}>{d.region} · {d.bestSeason ?? 'Season not published'}</Text>
            <Text style={{ color: c.textMuted, fontSize: font.sizes.xs }} numberOfLines={2}>{d.description}</Text>
            {d.hiddenGem ? <Text style={{ color: c.accent, fontSize: font.sizes.xs }}>Hidden gem</Text> : null}
          </View>
        </Pressable>
      ))}

      <SectionTitle eyebrow="Quieter places" title="Hidden gems" />
      {(data?.hiddenGems ?? []).map((g) => (
        <Pressable key={g.id} onPress={() => router.push({ pathname: '/explore', params: { gem: g.id } })} style={[styles.gem, { borderColor: c.border }]}>
          <Ionicons name="leaf-outline" size={18} color={c.accent} />
          <View style={{ flex: 1 }}><Text style={{ color: c.text }}>{g.name}</Text><Text style={{ color: c.textMuted, fontSize: font.sizes.xs }}>{g.route}</Text></View>
          <Ionicons name="chevron-forward-outline" size={18} color={c.textMuted} />
        </Pressable>
      ))}

      <SectionTitle eyebrow="Map" title="Location handoff" />
      <Card>
        <Text style={{ color: c.textMuted, fontSize: font.sizes.sm }}>An interactive map provider is configured through the location engine. Until a tile provider key is set, GOWAYY opens the verified coordinates in your device's map app instead of drawing a placeholder map.</Text>
        <Button title="Open nearby map" variant="secondary" onPress={() => {
          const d = data?.destinations[0];
          if (d) void openNavigationHandoff(null, d.coords); else showToast('Catalogue is still loading.');
        }} />
      </Card>
      <Button title="Image credits & licensing" variant="ghost" onPress={() => router.push('/credits')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hit: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  eyebrow: { fontSize: font.sizes.xs, letterSpacing: 1.5, fontWeight: '700' },
  title: { fontSize: font.sizes.xl, fontWeight: '800', marginTop: 2 },
  line: { fontSize: font.sizes.sm, lineHeight: 20 },
  dest: { flexDirection: 'row', borderWidth: 1, borderRadius: radius.sm, overflow: 'hidden', gap: spacing.md, alignItems: 'center' },
  destPhoto: { width: 96, height: 88, borderRadius: 0 },
  gem: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderBottomWidth: 1, paddingVertical: spacing.md },
});
