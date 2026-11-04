/** Partner mode (role-specific sections inside the customer app). No admin interface. */
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { driverRegistrationSchema } from '@gowayy/validation';
import { client } from '../src/lib/client';
import { useUI } from '../src/store/useUI';
import { Button, Card, DemoBanner, Field, Picker, Screen, SectionTitle, TextInput } from '../src/components/UI';
import { useTheme, spacing, font } from '../src/theme';
import type { z } from 'zod';

type DriverForm = z.infer<typeof driverRegistrationSchema>;

export default function PartnerScreen() {
  const router = useRouter();
  const { c } = useTheme();
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState('restaurant');
  const [listingId, setListingId] = useState('');
  const [services, setServices] = useState<string[]>(['cab']);
  const driver = useQuery({ queryKey: ['driverMe'], queryFn: () => client.driverMe() });
  const jobs = useQuery({ queryKey: ['jobs'], queryFn: () => client.jobs(), enabled: Boolean(driver.data?.driver) });
  const requests = useQuery({ queryKey: ['partnerRequests'], queryFn: () => client.partnerRequests() });
  const catalog = useQuery({ queryKey: ['catalog'], queryFn: () => client.catalog(), staleTime: 5 * 60_000 });
  const { control, handleSubmit, formState: { errors } } = useForm<DriverForm>({
    resolver: zodResolver(driverRegistrationSchema),
    defaultValues: { name: '', phone: '', vehicleClass: 'hatchback', services: ['cab'], licenceNumber: '', vehicleRegistration: '', insuranceNumber: '' },
  });

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['driverMe'] });
    await qc.invalidateQueries({ queryKey: ['jobs'] });
    await qc.invalidateQueries({ queryKey: ['partnerRequests'] });
  };

  const register = handleSubmit(async (d) => {
    setBusy(true); setError(null);
    try { await client.registerDriver({ ...d, services }); await refresh(); showToast('Driver profile created. Verification is pending.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Registration failed.'); }
    finally { setBusy(false); }
  });

  async function verifyDemo() {
    setBusy(true);
    try { const r = await client.verifyDriverDemo(); await refresh(); showToast(r.demoNotice); }
    catch (e) { setError(e instanceof Error ? e.message : 'Verification failed.'); }
    finally { setBusy(false); }
  }
  async function update(online: boolean) {
    setBusy(true);
    try { await client.updateDriver({ online, services }); await refresh(); showToast(online ? 'You are online for eligible jobs.' : 'You are offline.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Update failed.'); }
    finally { setBusy(false); }
  }
  async function accept(jobId: string) {
    setBusy(true);
    try { await client.acceptJob(jobId); await refresh(); showToast('Job accepted. Dispatch will not offer incompatible jobs during the active task.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Job could not be accepted.'); }
    finally { setBusy(false); }
  }
  async function claim() {
    if (!listingId) { setError('Choose a listing first.'); return; }
    setBusy(true);
    try { await client.claimPartner(role, listingId); await refresh(); showToast('Partner role claimed (development claim, not document verification).'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Claim failed.'); }
    finally { setBusy(false); }
  }

  const profile = driver.data?.driver;
  const rules = driver.data?.dispatchRules ?? {};
  const listings = role === 'restaurant' ? (catalog.data?.restaurants ?? [])
    : role === 'grocery' ? (catalog.data?.stores ?? []) : (catalog.data?.properties ?? []);

  return (
    <Screen>
      <SectionTitle eyebrow="Role-specific" title="Partner mode" />
      <DemoBanner>Partner functions live inside the same customer app. This is not an admin panel: there is no administrative dashboard, role escalation or site-wide management here. Claims and driver verification are clearly labelled development adapters.</DemoBanner>

      <SectionTitle eyebrow="Listings" title="Claim a partner listing" />
      <Picker label="Partner type" options={[{ id: 'restaurant', label: 'Restaurant' }, { id: 'grocery', label: 'Grocery store' }, { id: 'property', label: 'Property' }]} value={role} onChange={(r) => { setRole(r); setListingId(''); }} />
      <Picker label="Listing" options={listings.map((l) => ({ id: l.id, label: l.name }))} value={listingId || listings[0]?.id || ''} onChange={setListingId} />
      <Button title="Claim listing (demo)" loading={busy} onPress={() => void claim()} />

      <SectionTitle eyebrow="Requests" title="Incoming work" />
      {(requests.data?.orders ?? []).slice(0, 5).map((o) => <Card key={o.id}>
        <Text style={{ color: c.text, fontWeight: '600' }}>{o.reference} · {o.status}</Text>
        <Text style={{ color: c.textMuted, fontSize: font.sizes.xs }}>₹{(o.price.totalPaise / 100).toFixed(2)} · {o.items.length} items</Text>
        {['created', 'accepted', 'preparing'].includes(o.status) ? <Button title="Advance status" variant="secondary" onPress={() => void (async () => {
          try {
            const next = o.status === 'created' ? 'accepted' : o.status === 'accepted' ? 'preparing' : 'packed';
            await client.transitionOrder(o.id, next); await qc.invalidateQueries({ queryKey: ['partnerRequests'] });
          } catch (e) { showToast(e instanceof Error ? e.message : 'Transition rejected by the server.'); }
        })()} /> : null}
      </Card>)}
      {(requests.data?.bookings ?? []).slice(0, 5).map((b) => <Card key={b.id}>
        <Text style={{ color: c.text, fontWeight: '600' }}>{b.reference} · {b.title}</Text>
        <Text style={{ color: c.textMuted, fontSize: font.sizes.xs }}>{b.status}</Text>
        <Button title="Confirm booking" variant="secondary" onPress={() => void (async () => {
          try { await client.transitionBooking(b.id, 'confirmed', 'Confirmed by partner'); await qc.invalidateQueries({ queryKey: ['partnerRequests'] }); }
          catch (e) { showToast(e instanceof Error ? e.message : 'Transition rejected by the server.'); }
        })()} />
      </Card>)}
      {(requests.data?.orders.length ?? 0) + (requests.data?.bookings.length ?? 0) === 0 ? <Text style={{ color: c.textMuted, fontSize: font.sizes.sm }}>No incoming requests for your roles yet.</Text> : null}

      <SectionTitle eyebrow="Driver" title="Driver & delivery partner" />
      {!profile ? <Card>
        <Text style={{ color: c.textMuted, fontSize: font.sizes.sm }}>Register with your documents. Verification is required before going online.</Text>
        <Controller control={control} name="name" render={({ field }) => <Field label="Full name" error={errors.name?.message}><TextInput value={field.value} onChangeText={field.onChange} /></Field>} />
        <Controller control={control} name="phone" render={({ field }) => <Field label="Phone (10 digits)" error={errors.phone?.message}><TextInput value={field.value} onChangeText={field.onChange} keyboardType="phone-pad" /></Field>} />
        <Controller control={control} name="vehicleClass" render={({ field }) => <Field label="Vehicle class" error={errors.vehicleClass?.message}>
          <Picker label="" options={['hatchback', 'sedan', 'suv', 'bike', 'premium'].map((v) => ({ id: v, label: v }))} value={field.value} onChange={field.onChange} /></Field>} />
        <Controller control={control} name="licenceNumber" render={({ field }) => <Field label="Driving licence number" error={errors.licenceNumber?.message}><TextInput value={field.value} onChangeText={field.onChange} autoCapitalize="characters" /></Field>} />
        <Controller control={control} name="vehicleRegistration" render={({ field }) => <Field label="Vehicle registration" error={errors.vehicleRegistration?.message}><TextInput value={field.value} onChangeText={field.onChange} autoCapitalize="characters" /></Field>} />
        <Controller control={control} name="insuranceNumber" render={({ field }) => <Field label="Insurance number" error={errors.insuranceNumber?.message}><TextInput value={field.value} onChangeText={field.onChange} autoCapitalize="characters" /></Field>} />
        <Field label="Eligible services" hint="Dispatch checks vehicle eligibility and active-task conflicts.">
          <View style={styles.chips}>{['cab', 'food', 'grocery', 'parcel'].map((s) => {
            const on = services.includes(s);
            return <Button key={s} title={`${on ? '✓ ' : ''}${s}`} variant={on ? 'primary' : 'secondary'} onPress={() => setServices(on ? services.filter((x) => x !== s) : [...services, s])} />;
          })}</View>
        </Field>
        <Button title="Register as driver" loading={busy} onPress={() => void register()} />
      </Card> : <>
        <Card>
          <Text style={{ color: c.text, fontWeight: '700' }}>{profile.name}</Text>
          <Text style={{ color: c.textMuted, fontSize: font.sizes.sm }}>Verification: {profile.verification} · Online: {profile.online ? 'yes' : 'no'} · Vehicle: {profile.vehicleClass}</Text>
          <Text style={{ color: c.textMuted, fontSize: font.sizes.xs }}>Services: {profile.services.join(', ')}</Text>
          {profile.activeJobId ? <Text style={{ color: c.accent, fontSize: font.sizes.sm }}>Active task: {profile.activeJobId}. No unrelated job will be offered.</Text> : null}
          <Text style={{ color: c.textMuted, fontSize: font.sizes.xs }}>Dispatch rules: {JSON.stringify(rules)}</Text>
          {profile.verification !== 'verified' ? <Button title="Demo verification (not a real document check)" variant="secondary" loading={busy} onPress={() => void verifyDemo()} /> : null}
          {profile.verification === 'verified' ? <View style={styles.row}>
            <Button title="Go online" loading={busy} onPress={() => void update(true)} />
            <Button title="Go offline" variant="secondary" loading={busy} onPress={() => void update(false)} />
          </View> : null}
        </Card>
        <SectionTitle eyebrow="Dispatch" title="Available jobs" />
        {(jobs.data?.items ?? []).map((j) => <Card key={j.id}>
          <Text style={{ color: c.text, fontWeight: '600' }}>{j.service} · {j.status}</Text>
          <Text style={{ color: c.textMuted, fontSize: font.sizes.xs }}>{j.bookingId ?? j.orderId ?? j.id}</Text>
          <Button title="Accept job" loading={busy} disabled={Boolean(profile.activeJobId) || !profile.online} onPress={() => void accept(j.id)} />
        </Card>)}
        {(jobs.data?.items.length ?? 0) === 0 ? <Text style={{ color: c.textMuted, fontSize: font.sizes.sm }}>No open jobs. Jobs appear once customers place orders or bookings.</Text> : null}
      </>}
      {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
      <Button title="Back to profile" variant="ghost" onPress={() => router.push('/profile')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  error: { color: '#B45B4C', fontSize: font.sizes.sm },
});
