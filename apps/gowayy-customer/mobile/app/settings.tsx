import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { client, apiBaseUrl, assetBaseUrl } from '../src/lib/client';
import { Button, Card, Field, Picker, Screen, SectionTitle, TextInput } from '../src/components/UI';
import { useUI } from '../src/store/useUI';
import { useTheme, font, spacing } from '../src/theme';
import { expoLocationProvider } from '../src/lib/location';

export default function SettingsScreen() {
  const { c } = useTheme();
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const [label, setLabel] = useState('');
  const [placeId, setPlaceId] = useState('');
  const [saving, setSaving] = useState(false);
  const health = useQuery({ queryKey: ['health'], queryFn: () => client.health(), retry: 0 });
  const catalog = useQuery({ queryKey: ['catalog'], queryFn: () => client.catalog(), staleTime: 5 * 60_000 });
  const saved = useQuery({ queryKey: ['savedPlaces'], queryFn: () => client.savedPlaces() });
  const [locationLabel, setLocationLabel] = useState<string | null>(null);
  const places = catalog.data?.places ?? [];

  async function savePlace() {
    const id = placeId || places[0]?.id;
    if (!id) { showToast('Catalogue is still loading.'); return; }
    if (!label.trim()) { showToast('Enter a label first.'); return; }
    setSaving(true);
    try {
      await client.savePlace({ placeId: id, label: label.trim() });
      await qc.invalidateQueries({ queryKey: ['savedPlaces'] });
      setLabel(''); showToast('Place saved to your account.');
    } catch (e) { showToast(e instanceof Error ? e.message : 'Could not save place.'); }
    finally { setSaving(false); }
  }

  return (
    <Screen>
      <SectionTitle eyebrow="Configuration" title="App & connection" />
      <Card>
        <Text style={{ color: c.text, fontWeight: '600' }}>Backend</Text>
        <Text style={{ color: c.textMuted, fontSize: font.sizes.xs }}>{apiBaseUrl}</Text>
        <Text style={{ color: c.textMuted, fontSize: font.sizes.xs }}>Asset base: {assetBaseUrl || '(not set)'}</Text>
        <Text style={{ color: health.isError ? '#B45B4C' : c.accent, fontSize: font.sizes.sm }}>
          {health.isError ? 'API unreachable' : health.isLoading ? 'Checking…' : 'API reachable'}
        </Text>
        <Button title="Recheck connection" variant="secondary" onPress={() => void health.refetch()} />
      </Card>
      <Card>
        <Text style={{ color: c.text, fontWeight: '600' }}>GOWAYY lavender identity</Text>
        <Text style={{ color: c.textMuted, fontSize: font.sizes.xs }}>Soft lilac surfaces, warm cream and the official purple-and-orange mark.</Text>
      </Card>
      <Card>
        <Text style={{ color: c.text, fontWeight: '600' }}>Location permissions</Text>
        <Text style={{ color: c.textMuted, fontSize: font.sizes.xs }}>{locationLabel ?? 'Not checked'}</Text>
        <Button title="Check current location" variant="secondary" onPress={() => void (async () => {
          const fix = await expoLocationProvider.current();
          setLocationLabel(fix ? fix.label : 'Permission denied or unavailable. You can still choose destinations manually.');
        })()} />
      </Card>
      <Card>
        <Picker label="Place" options={places.map((p) => ({ id: p.id, label: p.name, sub: p.locality }))} value={placeId || places[0]?.id || ''} onChange={setPlaceId} />
        <Field label="Saved place label" hint="Saved places are attached to your account and reused when booking."><TextInput value={label} onChangeText={setLabel} placeholder="e.g. Airport pickup" /></Field>
        <Button title="Save place" loading={saving} onPress={() => void savePlace()} />
        {(saved.data ?? []).map((p) => {
          const row = p as Record<string, unknown>;
          return <Text key={String(row.id)} style={{ color: c.textMuted, fontSize: font.sizes.xs }}>· {String(row.label ?? row.name)}</Text>;
        })}
      </Card>
      <Card>
        <Text style={{ color: c.textMuted, fontSize: font.sizes.sm, lineHeight: 20 }}>
          No service-role keys or provider secrets are bundled into this app. Push tokens, payment webhooks and OTP delivery require server-side configuration (see docs/SETUP.md).
        </Text>
      </Card>
      <Text style={styles.foot}>GOWAYY · Expo Router · TypeScript strict · shared business logic with web</Text>
    </Screen>
  );
}
const styles = StyleSheet.create({ foot: { color: '#6F6876', fontSize: font.sizes.xs, marginTop: spacing.lg, marginBottom: spacing.xl } });
