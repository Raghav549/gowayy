import { useState } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { client, apiBaseUrl, assetBaseUrl } from '../src/lib/client';
import { Button, Card, Field, Picker, Screen, SectionTitle, TextInput } from '../src/components/UI';
import { useUI } from '../src/store/useUI';
import { useTheme, font, spacing } from '../src/theme';
import { expoLocationProvider } from '../src/lib/location';
import { registerNativePush, unregisterNativePush } from '../src/lib/notifications';
import type { NotificationPreferences } from '@gowayy/types';

const preferenceLabels: Array<{ key: keyof Omit<NotificationPreferences, 'updatedAt'>; label: string }> = [
  { key: 'pushEnabled', label: 'Push notifications' },
  { key: 'bookingUpdates', label: 'Booking and travel updates' },
  { key: 'orderUpdates', label: 'Order and delivery updates' },
  { key: 'paymentUpdates', label: 'Payment and refund updates' },
  { key: 'partnerUpdates', label: 'Partner updates' },
  { key: 'marketing', label: 'Offers and marketing' },
];

function NotificationSettings() {
  const { c } = useTheme();
  const showToast = useUI((s) => s.showToast);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [deviceStatus, setDeviceStatus] = useState('This device has not been registered from this screen.');
  const preferences = useQuery({ queryKey: ['notification-preferences'], queryFn: () => client.notificationPreferences(), retry: 0 });

  const update = async (key: keyof Omit<NotificationPreferences, 'updatedAt'>, value: boolean) => {
    setBusy(true);
    try {
      const next = await client.updateNotificationPreferences({ [key]: value });
      qc.setQueryData(['notification-preferences'], next);
      showToast('Notification preference saved.');
    } catch (error) { showToast(error instanceof Error ? error.message : 'Could not save notification preference.'); }
    finally { setBusy(false); }
  };
  const enableDevice = async () => {
    setBusy(true);
    try {
      await registerNativePush(true);
      setDeviceStatus('Registered with the server. Delivery still depends on the configured Expo provider.');
      showToast('This device is registered for push notifications.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Push registration failed.';
      setDeviceStatus(message); showToast(message);
    } finally { setBusy(false); }
  };
  const disableDevice = async () => {
    setBusy(true);
    try {
      await unregisterNativePush();
      setDeviceStatus('This installation was unregistered on the server. Operating-system permission is unchanged.');
    } catch (error) { showToast(error instanceof Error ? error.message : 'Could not unregister this device.'); }
    finally { setBusy(false); }
  };

  return <Card>
    <Text style={{ color: c.text, fontWeight: '700' }}>Notifications</Text>
    <Text style={{ color: c.textMuted, fontSize: font.sizes.xs, lineHeight: 18 }}>Device registration is separate from category preferences. Registering a token does not prove that a push was delivered.</Text>
    {preferences.isError ? <>
      <Text style={styles.preferenceError}>{preferences.error instanceof Error ? preferences.error.message : 'Notification preferences are unavailable.'}</Text>
      <Button title="Retry preferences" variant="secondary" onPress={() => void preferences.refetch()} />
    </> : preferences.data ? <>
      {preferenceLabels.map(({ key, label }) => <View key={key} style={styles.preferenceRow}>
        <Text style={[styles.preferenceLabel, { color: c.text }]}>{label}</Text>
        <Switch value={preferences.data[key]} disabled={busy || (key !== 'pushEnabled' && !preferences.data.pushEnabled)}
          onValueChange={(value) => void update(key, value)} trackColor={{ false: '#D8D0DE', true: '#BFA5D8' }} thumbColor={preferences.data[key] ? '#421080' : '#F7F4F8'} />
      </View>)}
      <Button title="Enable push on this device" onPress={() => void enableDevice()} loading={busy} />
      <Button title="Unregister this device" variant="secondary" onPress={() => void disableDevice()} disabled={busy} />
    </> : <Text style={{ color: c.textMuted }}>Loading notification preferences…</Text>}
    <Text style={{ color: c.textMuted, fontSize: font.sizes.xs, lineHeight: 18 }}>{deviceStatus}</Text>
  </Card>;
}

export default function SettingsScreen() {
  const router = useRouter();
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
      <Card><Text style={{ color: c.text, fontWeight: '600' }}>App updates</Text><Text style={{ color: c.textMuted, fontSize: font.sizes.xs }}>Check and install the latest Customer app release.</Text><Button title="Check for updates" variant="secondary" onPress={() => router.push('/update')} /></Card>
      <Card>
        <Text style={{ color: c.text, fontWeight: '600' }}>Backend</Text>
        <Text style={{ color: c.textMuted, fontSize: font.sizes.xs }}>{apiBaseUrl}</Text>
        <Text style={{ color: c.textMuted, fontSize: font.sizes.xs }}>Asset base: {assetBaseUrl || '(not set)'}</Text>
        <Text style={{ color: health.isError ? '#B45B4C' : c.accent, fontSize: font.sizes.sm }}>
          {health.isError ? 'API unreachable' : health.isLoading ? 'Checking…' : 'API reachable'}
        </Text>
        <Button title="Recheck connection" variant="secondary" onPress={() => void health.refetch()} />
      </Card>
      <NotificationSettings />
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
const styles = StyleSheet.create({
  foot: { color: '#6F6876', fontSize: font.sizes.xs, marginTop: spacing.lg, marginBottom: spacing.xl },
  preferenceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, minHeight: 44 },
  preferenceLabel: { flex: 1, minWidth: 0, fontSize: font.sizes.sm },
  preferenceError: { color: '#B45B4C', fontSize: font.sizes.sm, lineHeight: 20 },
});
