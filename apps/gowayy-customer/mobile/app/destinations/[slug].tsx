import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { client } from '../../src/lib/client';
import { useJourney } from '../../src/store/useJourney';
import { useUI } from '../../src/store/useUI';
import { Button, Card, Photo, Screen, SectionTitle, Badge } from '../../src/components/UI';
import { ListingCard } from '../../src/components/Cards';
import { openNavigationHandoff } from '../../src/lib/location';
import { useTheme, spacing, radius, font } from '../../src/theme';

export default function DestinationDetail() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const { c } = useTheme();
  const showToast = useUI((s) => s.showToast);
  const patchJourney = useJourney((s) => s.patch);
  const journey = useJourney((s) => s.journey);
  const catalog = useQuery({ queryKey: ['catalog'], queryFn: () => client.catalog(), staleTime: 5 * 60_000 });
  const destination = catalog.data?.destinations.find((d) => d.slug === slug || d.id === slug);
  const recs = useQuery({ queryKey: ['recommendations', destination?.id], queryFn: () => client.recommendations(destination!.id), enabled: Boolean(destination) });

  if (!destination) return <Screen><Card><Text style={{ color: c.text }}>{catalog.isLoading ? 'Loading destination…' : 'Destination not found.'}</Text>
    <Button title="Back to explore" variant="secondary" onPress={() => router.push('/explore')} /></Card></Screen>;

  const verified = destination.images.find((i) => i.status === 'verified');
  const data = catalog.data;
  const inDestination = (id: string) => id === destination.id;
  const makeActive = async () => {
    await patchJourney({ destinationId: destination.id, title: `${destination.name} trip`, dropoff: { name: destination.name, lat: destination.coords.lat, lng: destination.coords.lng } });
    showToast(`${destination.name} is now your active journey.`);
  };
  const groups = recs.data;

  return (
    <Screen>
      <Photo path={verified?.assetPath} alt={verified?.alt ?? destination.images[0]?.alt ?? `${destination.name} photograph`} style={styles.hero} />
      <View><Text style={[styles.title, { color: c.text }]}>{destination.name}</Text>
        <Text style={{ color: c.textMuted, fontSize: font.sizes.sm }}>{destination.region} · {destination.state}, {destination.country}</Text>
        <View style={styles.badges}>
          <Badge text={destination.infoStatus} />
          <Badge text={destination.coordinateAccuracy === 'published' ? 'Published coordinates' : 'Approximate coordinates'} />
          {destination.hiddenGem ? <Badge text="Hidden gem" /> : null}
        </View>
      </View>
      <Card><Text style={{ color: c.text, lineHeight: 21 }}>{destination.description}</Text></Card>

      <Card>
        <Text style={[styles.eyebrow, { color: c.accent }]}>PLAN YOUR VISIT</Text>
        <Info label="Best season" value={destination.bestSeason ?? 'Not published'} c={c} />
        <Info label="Estimated visit" value={destination.estimatedVisitHours ? `${destination.estimatedVisitHours} hours` : 'Not published'} c={c} />
        <Info label="Elevation" value={destination.elevationM ? `${destination.elevationM} m${destination.elevationVerified ? '' : ' (unverified)'}` : 'Not published'} c={c} />
        <Info label="Coordinates" value={`${destination.coords.lat.toFixed(4)}, ${destination.coords.lng.toFixed(4)}`} c={c} />
        <Info label="Accessibility" value={destination.accessibility} c={c} />
        <Info label="Safety" value={destination.safety} c={c} />
        <Info label="Weather" value={destination.weatherNote} c={c} />
        <Text style={{ color: c.textMuted, fontSize: font.sizes.xs, marginTop: spacing.sm }}>Sources: {destination.sources.join(' · ')}</Text>
      </Card>

      <Button title="Make this my active journey" onPress={() => void makeActive()} />
      <Button title="Navigation handoff" variant="secondary" onPress={() => void openNavigationHandoff(null, destination.coords)} />
      <Button title="Save this place" variant="secondary" onPress={() => void (async () => {
        try { await client.savePlace({ placeId: destination.id, label: destination.name }); showToast('Place saved.'); }
        catch (e) { showToast(e instanceof Error ? e.message : 'Could not save place.'); }
      })()} />

      <SectionTitle eyebrow="Connected journey" title="Complete your trip" />
      <Card>
        <Text style={{ color: c.textMuted, fontSize: font.sizes.sm }}>Every service below keeps {destination.name} as the shared journey context.</Text>
        <View style={styles.chips}>
          {(['properties', 'restaurants', 'attractions', 'packages', 'experiences', 'groceries', 'taxiRoutes'] as const).map((k) => (
            <View key={k} style={[styles.chip, { borderColor: c.border, backgroundColor: c.surfaceAlt }]}>
              <Text style={{ color: c.text, fontSize: font.sizes.xs }}>{k}: {groups?.[k]?.length ?? 0}</Text>
            </View>
          ))}
        </View>
        <Button title="Open journey dashboard" variant="ghost" onPress={() => journey ? router.push({ pathname: '/journey/[id]', params: { id: journey.id } }) : void makeActive()} />
      </Card>

      <SectionTitle eyebrow="Activities" title="Things to do" />
      <View style={styles.chips}>{destination.activities.map((a) => <View key={a} style={[styles.chip, { borderColor: c.border }]}><Text style={{ color: c.text, fontSize: font.sizes.xs }}>{a}</Text></View>)}</View>

      <SectionTitle eyebrow="Attractions" title="Places to see" />
      {(data?.attractions ?? []).filter((a) => inDestination(a.destinationId)).map((a) => (
        <Pressable key={a.id} onPress={() => router.push({ pathname: '/tourism', params: { attraction: a.id } })} style={[styles.row, { borderColor: c.border }]}>
          <Photo path={a.image.status === 'verified' ? a.image.assetPath : undefined} alt={a.image.alt} style={styles.thumb} />
          <View style={{ flex: 1 }}><Text style={{ color: c.text, fontWeight: '600' }}>{a.name}</Text><Text style={{ color: c.textMuted, fontSize: font.sizes.xs }} numberOfLines={2}>{a.description}</Text></View>
          <Ionicons name="chevron-forward-outline" size={18} color={c.textMuted} />
        </Pressable>
      ))}

      <SectionTitle eyebrow="Stays" title="Nearby accommodation" />
      <View style={styles.cards}>{(data?.properties ?? []).filter((p) => inDestination(p.destinationId)).map((p) => (
        <ListingCard key={p.id} title={p.name} subtitle={p.propertyType} alt={p.image.alt}
          path={p.image.status === 'verified' ? p.image.assetPath : undefined} pricePaise={p.rooms[0]?.nightlyRatePaise}
          href={{ pathname: '/hotels', params: { property: p.id } }} />
      ))}</View>

      <SectionTitle eyebrow="Food" title="Restaurants nearby" />
      <View style={styles.cards}>{(data?.restaurants ?? []).filter((r) => inDestination(r.destinationId)).map((r) => (
        <ListingCard key={r.id} title={r.name} subtitle={r.cuisines.join(', ')} alt={r.image.alt}
          path={r.image.status === 'verified' ? r.image.assetPath : undefined}
          href={{ pathname: '/food', params: { restaurant: r.id } }} />
      ))}</View>

      <SectionTitle eyebrow="Groceries" title="Delivery coverage" />
      {(data?.stores ?? []).filter((s) => inDestination(s.destinationId)).map((s) => (
        <Card key={s.id}><Text style={{ color: c.text, fontWeight: '600' }}>{s.name}</Text>
          <Text style={{ color: c.textMuted, fontSize: font.sizes.xs }}>Independent inventory · {s.deliveryCoverageKm} km coverage · {s.products.length} products</Text>
          <Button title="Shop this store" variant="ghost" onPress={() => router.push({ pathname: '/groceries', params: { store: s.id } })} /></Card>
      ))}

      <SectionTitle eyebrow="Transport" title="Taxi services" />
      {(data?.sharedRoutes ?? []).slice(0, 4).map((r) => <Card key={r.id}><Text style={{ color: c.text }}>{r.stand}</Text>
        <Text style={{ color: c.textMuted, fontSize: font.sizes.xs }}>{r.operator} · {r.seatsTotal} seats · {r.permitNote}</Text>
        <Button title="Book a seat" variant="ghost" onPress={() => router.push({ pathname: '/cabs', params: { shared: r.id } })} /></Card>)}
      <Button title="Private cab to this destination" onPress={() => router.push('/cabs')} />

      <SectionTitle eyebrow="Sources" title="Data & photographs" />
      <Card><Text style={{ color: c.textMuted, fontSize: font.sizes.xs }}>{destination.dataSourceNote ?? 'Destination facts are published references; listings are seeded demo data with real availability records.'}</Text>
        <Text style={{ color: c.textMuted, fontSize: font.sizes.xs }}>{verified ? `Photo: ${verified.credit} · ${verified.license} · ${verified.sourceUrl}` : 'No verified, permissibly licensed photograph of this exact place is available in the project manifest. The designed unavailable state is shown instead.'}</Text>
        <Button title="Full image credits" variant="ghost" onPress={() => router.push('/credits')} /></Card>
    </Screen>
  );
}

function Info({ label, value, c }: { label: string; value: string; c: { text: string; textMuted: string } }) {
  return <View style={styles.info}><Text style={{ color: c.text, fontWeight: '600', width: 110, fontSize: font.sizes.sm }}>{label}</Text>
    <Text style={{ color: c.textMuted, flex: 1, fontSize: font.sizes.sm }}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  hero: { height: 200, borderRadius: radius.md },
  title: { fontSize: font.sizes['2xl'], fontWeight: '800' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  eyebrow: { fontSize: font.sizes.xs, letterSpacing: 1.5, fontWeight: '700' },
  info: { flexDirection: 'row', gap: spacing.sm, paddingVertical: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderBottomWidth: 1, paddingVertical: spacing.sm },
  thumb: { width: 64, height: 56, borderRadius: radius.xs },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
