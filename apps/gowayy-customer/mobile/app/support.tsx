import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Linking } from 'react-native';
import { client } from '../src/lib/client';
import { Button, Card, Field, Screen, SectionTitle, TextInput } from '../src/components/UI';
import { useUI } from '../src/store/useUI';
import { useTheme, font, spacing } from '../src/theme';

export default function SupportScreen() {
  const { c } = useTheme();
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const tickets = useQuery({ queryKey: ['tickets'], queryFn: () => client.tickets() });
  const notifications = useQuery({ queryKey: ['notifications'], queryFn: () => client.notifications() });

  async function submit() {
    if (subject.trim().length < 3 || body.trim().length < 10) { showToast('Add a subject and at least 10 characters of detail.'); return; }
    setBusy(true);
    try { await client.createTicket({ subject: subject.trim(), body: body.trim() }); setSubject(''); setBody(''); await qc.invalidateQueries({ queryKey: ['tickets'] }); showToast('Support ticket created.'); }
    catch (e) { showToast(e instanceof Error ? e.message : 'Could not create ticket.'); }
    finally { setBusy(false); }
  }

  return (
    <Screen>
      <SectionTitle eyebrow="Help" title="Support & notifications" />
      <Card>
        <Text style={{ color: c.text }}>Emergency assistance during a trip</Text>
        <Text style={{ color: c.textMuted, fontSize: font.sizes.sm }}>For immediate danger, contact local emergency services. GOWAYY in-app support handles booking, payment and delivery issues.</Text>
        <Button title="Call emergency services (112)" variant="secondary" onPress={() => void Linking.openURL('tel:112')} />
      </Card>

      <SectionTitle eyebrow="Inbox" title={`${notifications.data?.unreadCount ?? 0} unread`} />
      {(notifications.data?.items ?? []).slice(0, 10).map((n) => (
        <Card key={n.id}>
          <Text style={{ color: n.readAt ? c.textMuted : c.text, fontWeight: n.readAt ? '400' : '700' }}>{n.title}</Text>
          <Text style={{ color: c.textMuted, fontSize: font.sizes.xs }}>{n.body}</Text>
          {!n.readAt ? <Button title="Mark read" variant="ghost" onPress={() => void (async () => { await client.markNotificationRead(n.id); await qc.invalidateQueries({ queryKey: ['notifications'] }); })()} /> : null}
        </Card>
      ))}
      <Button title="Mark all as read" variant="secondary" onPress={() => void (async () => { await client.markAllNotificationsRead(); await qc.invalidateQueries({ queryKey: ['notifications'] }); })()} />

      <SectionTitle eyebrow="Tickets" title="Your support requests" />
      {(tickets.data ?? []).map((t) => <Card key={t.id}><Text style={{ color: c.text }}>{t.subject} · {t.status}</Text><Text style={{ color: c.textMuted, fontSize: font.sizes.xs }}>{t.body}</Text></Card>)}
      {(tickets.data ?? []).length === 0 ? <Text style={{ color: c.textMuted, fontSize: font.sizes.sm }}>No tickets yet.</Text> : null}
      <Card>
        <Field label="Subject"><TextInput value={subject} onChangeText={setSubject} /></Field>
        <Field label="Details"><TextInput value={body} onChangeText={setBody} multiline /></Field>
        <Button title="Create a support ticket" loading={busy} onPress={() => void submit()} />
      </Card>
      <Text style={styles.foot}>Audit logs, rate limits and server-side permission checks protect account data.</Text>
    </Screen>
  );
}
const styles = StyleSheet.create({ foot: { color: '#6F6876', fontSize: font.sizes.xs, marginTop: spacing.lg, marginBottom: spacing.xl } });
