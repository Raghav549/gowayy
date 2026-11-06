import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { client } from '../../src/lib/client';
import { useJourney } from '../../src/store/useJourney';
import { useUI } from '../../src/store/useUI';
import { Button, Card, Field, Screen, SectionTitle, Skeleton, SkeletonList, TextInput } from '../../src/components/UI';
import { useTheme, spacing, radius, font } from '../../src/theme';

const SERVICES = [
  { key: 'cab', label: 'Airport / local cab', route: '/cabs' },
  { key: 'hotel', label: 'Hotel or homestay', route: '/hotels' },
  { key: 'tourism', label: 'Sightseeing', route: '/tourism' },
  { key: 'package', label: 'Tour package', route: '/packages' },
  { key: 'experience', label: 'Local experience', route: '/experiences' },
  { key: 'food', label: 'Restaurants', route: '/food' },
  { key: 'grocery', label: 'Grocery coverage', route: '/groceries' },
  { key: 'shared_taxi', label: 'Local taxi', route: '/cabs' },
] as const;

export default function JourneyDashboard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { c } = useTheme();
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const setJourney = useJourney((s) => s.set);
  const q = useQuery({ queryKey: ['journey', id], queryFn: () => client.journey(id), enabled: Boolean(id) });
  const catalog = useQuery({ queryKey: ['catalog'], queryFn: () => client.catalog(), staleTime: 5 * 60_000 });
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [travellers, setTravellers] = useState('');
  const [saving, setSaving] = useState(false);

  const j = q.data?.journey;
  const destination = catalog.data?.destinations.find((d) => d.id === j?.destinationId);
  const components = q.data?.components ?? [];

  async function save() {
    setSaving(true);
    try {
      const updated = await client.updateJourney(id, {
        ...(startDate ? { startDate } : {}), ...(endDate ? { endDate } : {}),
        ...(travellers ? { travellers: Number(travellers) } : {}),
      });
      setJourney(updated);
      await qc.invalidateQueries({ queryKey: ['journey', id] });
      showToast('Journey updated. Every service keeps this context.');
    } catch (e) { showToast(e instanceof Error ? e.message : 'Update failed.'); }
    finally { setSaving(false); }
  }

  if (!j) return <Screen>{q.isLoading ? <SkeletonList rows={3} /> : <Card><Text style={{ color: c.text }}>Journey not found.</Text><Button title="Explore" variant="secondary" onPress={() => router.push('/explore')} /></Card>}</Screen>;

  return (
    <Screen>
      <Card>
        <Text style={[styles.eyebrow, { color: c.accent }]}>CONNECTED JOURNEY</Text>
        <Text style={[styles.title, { color: c.text }]}>{j.title}</Text>
        <Text style={{ color: c.textMuted, fontSize: font.sizes.sm }}>{destination?.name ?? 'Destination not chosen yet'}</Text>
        <View style={styles.facts}>
          <Fact label="Pickup" value={j.pickup?.name ?? 'Not set'} c={c} />
          <Fact label="Drop-off" value={j.dropoff?.name ?? 'Not set'} c={c} />
          <Fact label="Dates" value={[j.startDate, j.endDate].filter(Boolean).join(' → ') || 'Not set'} c={c} />
          <Fact label="Travellers" value={String(j.travellers)} c={c} />
          <Fact label="Preferences" value={j.preferences.length ? j.preferences.join(', ') : 'None'} c={c} />
        </View>
      </Card>

      <SectionTitle eyebrow="Your trip" title="Component status" />
      {SERVICES.map((s) => {
        const found = components.filter((x) => x.service === s.key || (s.key === 'shared_taxi' && x.service === 'cab'));
        const state = found.length ? found.map((f) => f.statusLabel ?? f.state).join(', ') : 'Not booked';
        return <Pressable key={s.key} onPress={() => router.push(s.route)} style={[styles.row, { borderColor: c.border, backgroundColor: c.surface }]}>
          <Ionicons name={found.length ? 'checkmark-circle-outline' : 'ellipse-outline'} size={20} color={found.length ? c.accent : c.textMuted} />
          <View style={{ flex: 1 }}><Text style={{ color: c.text, fontWeight: '600' }}>{s.label}</Text>
            <Text style={{ color: c.textMuted, fontSize: font.sizes.xs }}>{state}</Text></View>
          <Ionicons name="chevron-forward-outline" size={18} color={c.textMuted} />
        </Pressable>;
      })}
      <Text style={{ color: c.textMuted, fontSize: font.sizes.xs }}>Status comes from the server. Opening any service keeps this journey attached to the new booking.</Text>

      <SectionTitle eyebrow="Plan" title="Journey details" />
      <Card>
        <Field label="Start date (YYYY-MM-DD)"><TextInput value={startDate || j.startDate || ''} onChangeText={setStartDate} autoCapitalize="none" /></Field>
        <Field label="End date (YYYY-MM-DD)"><TextInput value={endDate || j.endDate || ''} onChangeText={setEndDate} autoCapitalize="none" /></Field>
        <Field label="Travellers"><TextInput value={travellers || String(j.travellers)} onChangeText={setTravellers} keyboardType="numeric" /></Field>
        <Button title="Save journey details" loading={saving} onPress={() => void save()} />
      </Card>

      <SectionTitle eyebrow="Complete the journey" title="Connected recommendations" />
      {(catalog.data?.properties ?? []).filter((p) => p.destinationId === j.destinationId).slice(0, 3).map((p) => (
        <Pressable key={p.id} onPress={() => router.push({ pathname: '/hotels', params: { property: p.id } })} style={[styles.row, { borderColor: c.border }]}>
          <View style={{ flex: 1 }}><Text style={{ color: c.text }}>{p.name}</Text><Text style={{ color: c.textMuted, fontSize: font.sizes.xs }}>{p.propertyType} · seeded availability</Text></View>
          <Ionicons name="chevron-forward-outline" size={18} color={c.textMuted} />
        </Pressable>
      ))}
      {(catalog.data?.attractions ?? []).filter((a) => a.destinationId === j.destinationId).slice(0, 3).map((a) => (
        <Pressable key={a.id} onPress={() => router.push({ pathname: '/tourism', params: { attraction: a.id } })} style={[styles.row, { borderColor: c.border }]}>
          <View style={{ flex: 1 }}><Text style={{ color: c.text }}>{a.name}</Text><Text style={{ color: c.textMuted, fontSize: font.sizes.xs }}>Attraction · {a.infoStatus}</Text></View>
          <Ionicons name="chevron-forward-outline" size={18} color={c.textMuted} />
        </Pressable>
      ))}
      <View style={styles.links}>
        <Button title="Bookings" variant="secondary" onPress={() => router.push('/bookings')} />
        <Button title="Choose destination" variant="secondary" onPress={() => router.push('/explore')} />
      </View>
    </Screen>
  );
}

function Fact({ label, value, c }: { label: string; value: string; c: { text: string; textMuted: string } }) {
  return <View style={styles.fact}><Text style={{ color: c.text, fontWeight: '600', fontSize: font.sizes.sm, width: 92 }}>{label}</Text>
    <Text style={{ color: c.textMuted, flex: 1, fontSize: font.sizes.sm }}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  eyebrow: { fontSize: font.sizes.xs, letterSpacing: 1.5, fontWeight: '700' },
  title: { fontSize: font.sizes.xl, fontWeight: '800', marginTop: 2 },
  facts: { marginTop: spacing.sm, gap: 2 },
  fact: { flexDirection: 'row' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderRadius: radius.sm, padding: spacing.md, marginBottom: spacing.xs },
  links: { gap: spacing.sm, marginTop: spacing.md, marginBottom: spacing.xl },
});
