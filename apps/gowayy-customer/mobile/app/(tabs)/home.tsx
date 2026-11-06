import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { client } from '../../src/lib/client';
import { useJourney } from '../../src/store/useJourney';
import { useSession } from '../../src/store/useSession';
import { useUI } from '../../src/store/useUI';
import { Button, Card, DemoBanner, EmptyState, Photo, Screen, SectionTitle, TextInput } from '../../src/components/UI';
import { ListingCard } from '../../src/components/Cards';
import { expoLocationProvider, type LocationFix } from '../../src/lib/location';
import { useTheme, spacing, radius, font } from '../../src/theme';
import type { Destination } from '@gowayy/types';

const SERVICES = [
  { key: 'cabs', label: 'Cabs', icon: 'car-outline' },
  { key: 'hotels', label: 'Hotels', icon: 'bed-outline' },
  { key: 'food', label: 'Food', icon: 'restaurant-outline' },
  { key: 'groceries', label: 'Groceries', icon: 'basket-outline' },
  { key: 'tourism', label: 'Tourism', icon: 'map-outline' },
  { key: 'experiences', label: 'Experiences', icon: 'sparkles-outline' },
  { key: 'packages', label: 'Packages', icon: 'ticket-outline' },
  { key: 'parcels', label: 'Parcels', icon: 'cube-outline' },
] as const;

const verifiedPath = (d: Destination): string | undefined => d.images.find((i) => i.status === 'verified')?.assetPath;

export default function HomeScreen() {
  const router = useRouter();
  const { c } = useTheme();
  const user = useSession((s) => s.user);
  const showToast = useUI((s) => s.showToast);
  const journey = useJourney((s) => s.journey);
  const ensureJourney = useJourney((s) => s.ensure);
  const patchJourney = useJourney((s) => s.patch);
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState<LocationFix | null>(null);
  const catalog = useQuery({ queryKey: ['catalog'], queryFn: () => client.catalog(), staleTime: 5 * 60_000 });
  const hits = useQuery({ queryKey: ['search', query], queryFn: () => client.search(query), enabled: query.trim().length > 1 });
  const recs = useQuery({
    queryKey: ['recommendations', journey?.destinationId],
    queryFn: () => client.recommendations(journey!.destinationId!),
    enabled: Boolean(journey?.destinationId),
  });
  const notifications = useQuery({ queryKey: ['notifications'], queryFn: () => client.notifications(), enabled: Boolean(user), refetchInterval: 60_000 });

  useEffect(() => { if (user) void ensureJourney(); }, [user, ensureJourney]);
  const [locationExplainOpen, setLocationExplainOpen] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const requestLocation = async (explainFirst = false) => {
    if (explainFirst) setLocationExplainOpen(true);
    const fix = await expoLocationProvider.current();
    if (fix) { setLocation(fix); setLocationError(null); setLocationExplainOpen(false); }
    else { setLocationError('Location permission was not granted or GPS is disabled. You can still pick a destination manually, or enable location in system settings and retry.'); if (!explainFirst) setLocationExplainOpen(true); }
  };
  useEffect(() => { void expoLocationProvider.current().then((fix) => { if (fix) setLocation(fix); }); }, []);

  const data = catalog.data;
  const active = useMemo(() => data?.destinations.find((d) => d.id === journey?.destinationId), [data, journey?.destinationId]);
  const inDestination = (id: string) => (journey?.destinationId ? id === journey.destinationId : true);
  const submitSearch = () => {
    const first = hits.data?.[0];
    if (first) router.push({ pathname: '/explore', params: { q: query } });
    else router.push({ pathname: '/explore', params: { q: query } });
  };
  const selectDestination = (d: Destination) => {
    void patchJourney({ destinationId: d.id, dropoff: { name: d.name, lat: d.coords.lat, lng: d.coords.lng } });
    router.push({ pathname: '/destinations/[slug]', params: { slug: d.slug } });
  };

  return (
    <Screen>
      <View style={styles.locationRow}>
        <Ionicons name="location-outline" size={16} color={c.accent} />
        <Pressable onPress={() => void requestLocation(true)}>
          <Text style={{ color: c.text, fontSize: font.sizes.sm }} numberOfLines={1}>{location?.label ?? 'Choose your location'}</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/settings')} hitSlop={10}><Text style={{ color: c.accent, fontSize: font.sizes.sm }}>Change</Text></Pressable>
        <Pressable onPress={() => router.push('/support')} hitSlop={10} accessibilityLabel="Notifications and support">
          <Ionicons name="notifications-outline" size={20} color={c.text} />
          {notifications.data?.unreadCount ? <View style={[styles.badgeDot, { backgroundColor: c.accent }]} /> : null}
        </Pressable>
      </View>

      {locationExplainOpen && (
        <Card>
          <Text style={{ color: c.text, fontWeight: '700' }}>Why GOWAYY needs your location</Text>
          <Text style={{ color: c.textMuted, fontSize: font.sizes.sm, marginTop: 8 }}>We use it only to rank nearby stays, food, groceries and travel options, check delivery availability, and pre-fill cab/parcel pickup. Your coordinates never leave the device except as your chosen journey context — we do not track in the background.</Text>
          <Text style={{ color: c.textMuted, fontSize: font.sizes.sm, marginTop: 8 }}>If you deny, you can always pick a destination manually. You can retry after enabling location in system settings. On Android this needs the Location permission and GPS enabled.</Text>
          {locationError && <Text style={{ color: '#B94D59', fontSize: font.sizes.sm, marginTop: 8 }}>{locationError}</Text>}
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
            <Button title="Allow & get location" onPress={() => void requestLocation(false)} />
            <Button title="Not now" variant="ghost" onPress={() => setLocationExplainOpen(false)} />
          </View>
        </Card>
      )}

      <View>
        <Text style={[styles.hero, { color: c.text }]}>Where would you like to go?</Text>
        <Text style={[styles.heroSub, { color: c.textMuted }]}>One account. Every service. One connected journey.</Text>
      </View>
      <View style={styles.searchRow}>
        <View style={{ flex: 1 }}><TextInput value={query} onChangeText={setQuery} placeholder="Darjeeling, momos, airport…" autoCapitalize="none" testID="home-search" /></View>
        <Pressable onPress={submitSearch} accessibilityRole="button" style={[styles.searchBtn, { backgroundColor: c.accent }]}>
          <Ionicons name="search" size={20} color={c.accentContrast} />
        </Pressable>
      </View>
      {query.trim().length > 1 ? <Card>
        {hits.isLoading ? <Text style={{ color: c.textMuted }}>Searching…</Text> : null}
        {hits.data?.slice(0, 5).map((h) => (
          <Pressable key={`${h.kind}-${h.id}`} onPress={() => router.push({ pathname: '/explore', params: { q: h.title } })} style={styles.hit}>
            <Text style={{ color: c.text, flex: 1 }}>{h.title}</Text><Text style={{ color: c.textMuted, fontSize: font.sizes.xs }}>{h.kind}</Text>
          </Pressable>
        ))}
        {hits.data?.length === 0 ? <Text style={{ color: c.textMuted }}>No matches. Try another place or service.</Text> : null}
      </Card> : null}

      <SectionTitle eyebrow="Services" title="Everything for the journey" />
      <View style={styles.grid}>
        {SERVICES.map((s) => (
          <Pressable key={s.key} onPress={() => router.push(`/${s.key}`)} accessibilityRole="button"
            style={({ pressed }) => [styles.tile, { backgroundColor: c.surface, borderColor: c.border, opacity: pressed ? 0.85 : 1 }]}>
            <Ionicons name={s.icon} size={22} color={c.accent} />
            <Text style={{ color: c.text, fontSize: font.sizes.xs, fontWeight: '600' }}>{s.label}</Text>
          </Pressable>
        ))}
      </View>

      {active ? <Card>
        <Text style={[styles.eyebrow, { color: c.accent }]}>CONNECTED JOURNEY</Text>
        <Text style={[styles.cardTitle, { color: c.text }]}>Complete your {active.name} trip</Text>
        <Text style={{ color: c.textMuted, fontSize: font.sizes.sm }}>
          {journey?.pickup?.name ? `${journey.pickup.name} → ${active.name} · ` : ''}Services below keep this journey context.
        </Text>
        <View style={styles.chips}>
          {(['properties', 'restaurants', 'attractions', 'packages', 'experiences', 'groceries', 'taxiRoutes'] as const).map((k) => {
            const items = recs.data?.[k] ?? [];
            return <View key={k} style={[styles.chip, { borderColor: c.border, backgroundColor: c.surfaceAlt }]}>
              <Text style={{ color: c.text, fontWeight: '600' }}>{items.length} {k}</Text>
            </View>;
          })}
        </View>
        <Button title="Open journey dashboard" variant="secondary" onPress={() => journey ? router.push({ pathname: '/journey/[id]', params: { id: journey.id } }) : showToast('No active journey yet. Choose a destination below.')} />
      </Card> : null}

      <DemoBanner>Demo listings are seeded with real availability records and clearly tagged. Booking status, pricing and payments are server-authoritative.</DemoBanner>

      {catalog.isError ? <EmptyState title="Could not load the catalogue" body="Check EXPO_PUBLIC_GOWAYY_API_BASE_URL and that the API is reachable, then pull to try again."
        action={<Button title="Retry" variant="secondary" onPress={() => void catalog.refetch()} />} /> : null}

      {data ? <>
        <SectionTitle eyebrow="Discover" title="Popular destinations" />
        <FlatList horizontal data={data.destinations} keyExtractor={(d) => d.id} showsHorizontalScrollIndicator={false} initialNumToRender={4}
          renderItem={({ item }) => (
            <ListingCard title={item.name} subtitle={item.region} alt={item.images[0]?.alt ?? `${item.name} photograph`} path={verifiedPath(item)}
              badge={item.hiddenGem ? 'Hidden gem' : undefined} href={{ pathname: '/destinations/[slug]', params: { slug: item.slug } }} />
          )} />
        <View style={styles.quickRow}>
          {data.destinations.slice(0, 5).map((d) => (
            <Pressable key={d.id} onPress={() => selectDestination(d)} style={[styles.quickChip, { borderColor: c.border, backgroundColor: c.surfaceAlt }]}>
              <Text style={{ color: c.text, fontSize: font.sizes.xs }}>{d.name}</Text>
            </Pressable>
          ))}
        </View>

        <SectionTitle eyebrow="Stays" title="Hotels & homestays" />
        <FlatList horizontal data={data.properties.filter((p) => inDestination(p.destinationId))} keyExtractor={(p) => p.id} showsHorizontalScrollIndicator={false} initialNumToRender={3}
          renderItem={({ item }) => <ListingCard title={item.name} subtitle={`${item.propertyType} · ${item.amenities.slice(0, 2).join(', ')}`}
            alt={item.image.alt} path={item.image.status === 'verified' ? item.image.assetPath : undefined}
            pricePaise={item.rooms[0]?.nightlyRatePaise} badge="Demo listing" href={{ pathname: '/hotels', params: { property: item.id } }} />} />

        <SectionTitle eyebrow="Eat" title="Nearby restaurants" />
        <FlatList horizontal data={data.restaurants.filter((r) => inDestination(r.destinationId))} keyExtractor={(r) => r.id} showsHorizontalScrollIndicator={false} initialNumToRender={3}
          renderItem={({ item }) => <ListingCard title={item.name} subtitle={`${item.cuisines.join(', ')} · ${item.prepMinutes} min prep`}
            alt={item.image.alt} path={item.image.status === 'verified' ? item.image.assetPath : undefined}
            pricePaise={item.menu[0]?.pricePaise} badge="Demo listing" href={{ pathname: '/food', params: { restaurant: item.id } }} />} />

        <SectionTitle eyebrow="Shop" title="Grocery stores" />
        <FlatList horizontal data={data.stores.filter((s) => inDestination(s.destinationId))} keyExtractor={(s) => s.id} showsHorizontalScrollIndicator={false} initialNumToRender={3}
          renderItem={({ item }) => <ListingCard title={item.name} subtitle={`Delivery within ${item.deliveryCoverageKm} km · ${item.products.length} products`}
            alt={item.image.alt} path={item.image.status === 'verified' ? item.image.assetPath : undefined}
            badge="Independent inventory" href={{ pathname: '/groceries', params: { store: item.id } }} />} />

        <SectionTitle eyebrow="Explore" title="Attractions & experiences" />
        <FlatList horizontal data={data.attractions.filter((a) => inDestination(a.destinationId))} keyExtractor={(a) => a.id} showsHorizontalScrollIndicator={false} initialNumToRender={3}
          renderItem={({ item }) => <ListingCard title={item.name} subtitle={item.description.slice(0, 70)} alt={item.image.alt}
            path={item.image.status === 'verified' ? item.image.assetPath : undefined}
            badge={item.infoStatus} href={{ pathname: '/tourism', params: { attraction: item.id } }} />} />

        <SectionTitle eyebrow="Move" title="Shared taxi routes" />
        {data.sharedRoutes.slice(0, 4).map((r) => (
          <Pressable key={r.id} onPress={() => router.push({ pathname: '/cabs', params: { shared: r.id } })}
            style={[styles.route, { borderColor: c.border, backgroundColor: c.surface }]}>
            <View style={{ flex: 1 }}><Text style={{ color: c.text, fontWeight: '600' }}>{r.stand}</Text>
              <Text style={{ color: c.textMuted, fontSize: font.sizes.xs }}>{r.departureTimes.slice(0, 3).join(' · ')} · {r.seatsTotal} seats</Text></View>
            <Text style={{ color: c.accent, fontWeight: '600' }}>₹{(r.pricePaise / 100).toFixed(0)}</Text>
          </Pressable>
        ))}

        <SectionTitle eyebrow="Quieter places" title="Hidden gems" />
        {data.hiddenGems.slice(0, 3).map((g) => (
          <Card key={g.id}>
            <Text style={{ color: c.text, fontWeight: '700' }}>{g.name}</Text>
            <Text style={{ color: c.textMuted, fontSize: font.sizes.xs }}>{g.route}</Text>
            <Text style={{ color: c.textMuted, fontSize: font.sizes.xs }}>{g.safetyWarnings}</Text>
            <Button title="View on map" variant="ghost" onPress={() => router.push({ pathname: '/explore', params: { gem: g.id } })} />
          </Card>
        ))}

        <SectionTitle eyebrow="Provenance" title="Real photographs" />
        <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
          {data.destinations.slice(0, 3).map((d) => (
            <Photo key={d.id} path={verifiedPath(d)} alt={d.images[0]?.alt ?? `${d.name} photograph`} style={styles.provenancePhoto} />
          ))}
        </View>
        <Button title="View image credits" variant="ghost" onPress={() => router.push('/credits')} />
      </> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  badgeDot: { position: 'absolute', top: -2, right: -2, width: 7, height: 7, borderRadius: 4 },
  hero: { fontSize: font.sizes['2xl'], fontWeight: '800', letterSpacing: -0.5 },
  heroSub: { fontSize: font.sizes.sm, marginTop: 3 },
  searchRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  searchBtn: { width: 48, height: 46, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  hit: { flexDirection: 'row', paddingVertical: spacing.xs, gap: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: { width: '23%', minWidth: 74, aspectRatio: 1, borderWidth: 1, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', gap: 6 },
  eyebrow: { fontSize: font.sizes.xs, letterSpacing: 1.6, fontWeight: '700' },
  cardTitle: { fontSize: font.sizes.lg, fontWeight: '700', marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: spacing.sm },
  chip: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm },
  quickChip: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 5 },
  route: { borderWidth: 1, borderRadius: radius.sm, padding: spacing.md, flexDirection: 'row', alignItems: 'center' },
  provenancePhoto: { width: '31%', height: 96 },
});
