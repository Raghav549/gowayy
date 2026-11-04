import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { client } from '../../src/lib/client';
import { useSession } from '../../src/store/useSession';
import { useUI } from '../../src/store/useUI';
import { useJourney } from '../../src/store/useJourney';
import { Button, Card, Field, Screen, SectionTitle, TextInput } from '../../src/components/UI';
import { useTheme, spacing, radius, font } from '../../src/theme';

export default function ProfileScreen() {
  const router = useRouter();
  const { c } = useTheme();
  const qc = useQueryClient();
  const user = useSession((s) => s.user);
  const refreshUser = useSession((s) => s.refresh);
  const clearSession = useSession((s) => s.clear);
  const clearJourney = useJourney((s) => s.clear);
  const showToast = useUI((s) => s.showToast);
  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [saving, setSaving] = useState(false);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [label, setLabel] = useState('Home');
  const [line1, setLine1] = useState('');
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState('West Bengal');
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketBody, setTicketBody] = useState('');
  const addresses = useQuery({ queryKey: ['addresses'], queryFn: () => client.addresses() });
  const saved = useQuery({ queryKey: ['savedPlaces'], queryFn: () => client.savedPlaces() });
  const tickets = useQuery({ queryKey: ['tickets'], queryFn: () => client.tickets() });
  const notifications = useQuery({ queryKey: ['notifications'], queryFn: () => client.notifications() });

  async function saveProfile() {
    if (!firstName.trim() || !lastName.trim()) { showToast('Both names are required.'); return; }
    setSaving(true);
    try { await client.updateProfile({ firstName: firstName.trim(), lastName: lastName.trim() }); await refreshUser(); showToast('Profile updated.'); }
    catch (e) { showToast(e instanceof Error ? e.message : 'Update failed.'); }
    finally { setSaving(false); }
  }
  async function addAddress() {
    if (line1.trim().length < 3 || city.trim().length < 2) { showToast('Enter a street and city.'); return; }
    try {
      await client.createAddress({ label, line1: line1.trim(), city: city.trim(), state: stateName, isDefault: false });
      await qc.invalidateQueries({ queryKey: ['addresses'] });
      setShowAddressForm(false); setLine1(''); setCity(''); showToast('Address saved.');
    } catch (e) { showToast(e instanceof Error ? e.message : 'Could not save address.'); }
  }
  async function createTicket() {
    if (ticketSubject.trim().length < 3 || ticketBody.trim().length < 10) { showToast('Add a subject and at least 10 characters of detail.'); return; }
    try {
      await client.createTicket({ subject: ticketSubject.trim(), body: ticketBody.trim() });
      await qc.invalidateQueries({ queryKey: ['tickets'] });
      setTicketSubject(''); setTicketBody(''); showToast('Support ticket created.');
    } catch (e) { showToast(e instanceof Error ? e.message : 'Could not create ticket.'); }
  }
  function logout() {
    void (async () => {
      try { await client.logout(); } catch { /* local session still cleared */ }
      clearSession(); clearJourney(); qc.clear(); router.replace('/auth/login');
    })();
  }
  function deleteAccount() {
    Alert.alert('Delete account', 'This permanently removes your GOWAYY account and related personal data. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void (async () => {
        try { await client.deleteAccount(); } catch (e) { showToast(e instanceof Error ? e.message : 'Deletion failed.'); return; }
        clearSession(); clearJourney(); qc.clear(); router.replace('/auth/login');
      })() },
    ]);
  }

  if (!user) return <Screen><Card><Text style={{ color: c.text }}>Sign in to view your account.</Text><Button title="Sign in" onPress={() => router.replace('/auth/login')} /></Card></Screen>;

  return (
    <Screen>
      <Card>
        <View style={styles.head}><View style={[styles.avatar, { backgroundColor: c.surfaceAlt, borderColor: c.accent }]}>
          <Text style={{ color: c.accent, fontSize: font.sizes.xl, fontWeight: '800' }}>{user.firstName[0]}{user.lastName[0]}</Text>
        </View>
          <View style={{ flex: 1 }}><Text style={{ color: c.text, fontSize: font.sizes.lg, fontWeight: '700' }}>{user.firstName} {user.lastName}</Text>
            <Text style={{ color: c.textMuted, fontSize: font.sizes.sm }}>{user.email}</Text>
            <Text style={{ color: c.textMuted, fontSize: font.sizes.xs }}>Roles: {user.roles.join(', ')}</Text></View></View>
        <Field label="First name"><TextInput value={firstName} onChangeText={setFirstName} /></Field>
        <Field label="Last name"><TextInput value={lastName} onChangeText={setLastName} /></Field>
        <Button title="Save profile" loading={saving} onPress={() => void saveProfile()} />
      </Card>

      <SectionTitle eyebrow="Appearance" title="Lavender identity" />
      <Card>
        <Text style={{ color: c.textMuted, fontSize: font.sizes.sm }}>Soft lavender surfaces, warm cream and the official GOWAYY purple-and-orange mark.</Text>
      </Card>

      <SectionTitle eyebrow="Navigation" title="Quick links" />
      <View style={styles.links}>
        <Button title="Journey dashboard" variant="secondary" onPress={() => router.push('/journey')} />
        <Button title="Partner mode" variant="secondary" onPress={() => router.push('/partner')} />
        <Button title="Support" variant="secondary" onPress={() => router.push('/support')} />
        <Button title="Image credits" variant="secondary" onPress={() => router.push('/credits')} />
        <Button title="Settings & connection" variant="secondary" onPress={() => router.push('/settings')} />
      </View>

      <SectionTitle eyebrow="Notifications" title={`${notifications.data?.unreadCount ?? 0} unread`} />
      <Card>
        {(notifications.data?.items ?? []).slice(0, 4).map((n) => (
          <Pressable key={n.id} onPress={() => void (async () => { await client.markNotificationRead(n.id); await qc.invalidateQueries({ queryKey: ['notifications'] }); })()}>
            <Text style={{ color: n.readAt ? c.textMuted : c.text, fontWeight: n.readAt ? '400' : '700' }}>{n.title}</Text>
            <Text style={{ color: c.textMuted, fontSize: font.sizes.xs }}>{n.body}</Text>
          </Pressable>
        ))}
        {(notifications.data?.items.length ?? 0) === 0 ? <Text style={{ color: c.textMuted }}>No notifications yet.</Text> : null}
        <Button title="Mark all read" variant="ghost" onPress={() => void (async () => { await client.markAllNotificationsRead(); await qc.invalidateQueries({ queryKey: ['notifications'] }); })()} />
      </Card>

      <SectionTitle eyebrow="Account" title="Saved addresses" />
      {(addresses.data ?? []).map((a) => {
        const row = a as Record<string, unknown>;
        return <Card key={String(row.id)}><Text style={{ color: c.text }}>{String(row.label)} · {String(row.line1)}</Text>
          <Button title="Remove" variant="ghost" onPress={() => void (async () => { await client.deleteAddress(String(row.id)); await qc.invalidateQueries({ queryKey: ['addresses'] }); })()} /></Card>;
      })}
      {showAddressForm ? <Card>
        <Field label="Label"><TextInput value={label} onChangeText={setLabel} /></Field>
        <Field label="Street / area"><TextInput value={line1} onChangeText={setLine1} /></Field>
        <Field label="City"><TextInput value={city} onChangeText={setCity} /></Field>
        <Field label="State"><TextInput value={stateName} onChangeText={setStateName} /></Field>
        <Button title="Save address" onPress={() => void addAddress()} />
      </Card> : <Button title="Add address" variant="secondary" onPress={() => setShowAddressForm(true)} />}

      <SectionTitle eyebrow="Account" title="Saved places" />
      {(saved.data ?? []).map((p) => <Card key={String((p as Record<string, unknown>).id)}><Text style={{ color: c.text }}>{String((p as Record<string, unknown>).name ?? (p as Record<string, unknown>).label)}</Text></Card>)}
      {(saved.data ?? []).length === 0 ? <Text style={{ color: c.textMuted, fontSize: font.sizes.sm }}>Save a place from destination discovery to reuse it when booking.</Text> : null}

      <SectionTitle eyebrow="Help" title="Support tickets" />
      {(tickets.data ?? []).map((t) => <Card key={t.id}><Text style={{ color: c.text }}>{t.subject} · {t.status}</Text><Text style={{ color: c.textMuted, fontSize: font.sizes.xs }}>{t.body}</Text></Card>)}
      <Card>
        <Field label="Subject"><TextInput value={ticketSubject} onChangeText={setTicketSubject} /></Field>
        <Field label="How can we help?"><TextInput value={ticketBody} onChangeText={setTicketBody} multiline /></Field>
        <Button title="Create ticket" onPress={() => void createTicket()} />
      </Card>

      <View style={styles.danger}>
        <Button title="Sign out" variant="secondary" onPress={logout} />
        <Button title="Delete account" variant="danger" onPress={deleteAccount} />
      </View>
      <Text style={styles.foot}>GOWAYY · Customer app · No admin interface</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  avatar: { width: 54, height: 54, borderRadius: 27, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  links: { gap: spacing.sm },
  danger: { gap: spacing.sm, marginTop: spacing.lg },
  foot: { color: '#6F6876', fontSize: font.sizes.xs, textAlign: 'center', marginTop: spacing.lg, marginBottom: spacing.xl },
});
