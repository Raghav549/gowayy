import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { client } from '../../src/lib/client';
import { useUI } from '../../src/store/useUI';
import { Button, Card, EmptyState, Screen, SectionTitle } from '../../src/components/UI';
import { useTheme, spacing, radius, font } from '../../src/theme';
import type { Booking } from '@gowayy/types';

export default function BookingsScreen() {
  const router = useRouter();
  const { c } = useTheme();
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const [busyId, setBusyId] = useState<string | null>(null);
  const bookings = useQuery({ queryKey: ['bookings'], queryFn: () => client.bookings() });

  async function cancel(b: Booking) {
    setBusyId(b.id);
    try { await client.cancelBooking(b.id, 'Cancelled by customer'); await qc.invalidateQueries({ queryKey: ['bookings'] }); showToast('Booking cancelled. Any captured payment is refunded on the server.'); }
    catch (e) { showToast(e instanceof Error ? e.message : 'Cancellation failed.'); }
    finally { setBusyId(null); }
  }

  return (
    <Screen>
      <SectionTitle eyebrow="Account" title="Bookings & reservations" />
      {bookings.isLoading ? <Text style={{ color: c.textMuted }}>Loading…</Text> : null}
      {bookings.data?.length === 0 ? <EmptyState title="No bookings yet" body="Book a cab, stay, sightseeing experience or parcel and it will appear here with its server-side status."
        action={<Button title="Explore services" onPress={() => router.push('/home')} />} /> : null}
      {bookings.data?.map((b) => (
        <Card key={b.id}>
          <View style={styles.head}>
            <Text style={{ color: c.text, fontWeight: '700', flex: 1 }} numberOfLines={1}>{b.title}</Text>
            <View style={[styles.status, { borderColor: c.accent }]}><Text style={{ color: c.accent, fontSize: font.sizes.xs }}>{b.status.replace(/_/g, ' ')}</Text></View>
          </View>
          <Text style={{ color: c.textMuted, fontSize: font.sizes.xs }}>{b.service.replace(/_/g, ' ')} · {b.reference} · {new Date(b.createdAt).toLocaleString()}</Text>
          <Text style={{ color: c.accent, fontWeight: '700', marginTop: spacing.xs }}>₹{(b.price.totalPaise / 100).toFixed(2)}</Text>
          <View style={styles.lines}>
            {b.price.lines.map((l, i) => <Text key={i} style={{ color: c.textMuted, fontSize: font.sizes.xs }}>{l.label}: ₹{(l.paise / 100).toFixed(2)}</Text>)}
            <Text style={{ color: c.textMuted, fontSize: font.sizes.xs }}>GST: ₹{(b.price.taxPaise / 100).toFixed(2)} · Commission: ₹{(b.price.commissionPaise / 100).toFixed(2)}</Text>
          </View>
          <View style={styles.actions}>
            <Button title="Payment" variant="secondary" onPress={() => router.push({ pathname: '/checkout', params: { bookingId: b.id } })} />
            {b.journeyId ? <Button title="Journey" variant="secondary" onPress={() => router.push({ pathname: '/journey/[id]', params: { id: b.journeyId! } })} /> : null}
            {!['cancelled', 'refunded', 'completed'].includes(b.status) ? <Button title="Cancel" variant="danger" loading={busyId === b.id} onPress={() => void cancel(b)} /> : null}
          </View>
          {b.statusHistory.length > 1 ? <Pressable onPress={() => showToast(b.statusHistory.map((h) => `${h.status} · ${new Date(h.at).toLocaleTimeString()}`).join('  →  '))}>
            <Text style={{ color: c.textMuted, fontSize: font.sizes.xs }}>View status history ({b.statusHistory.length})</Text>
          </Pressable> : null}
        </Card>
      ))}
      <Button title="Refresh" variant="ghost" onPress={() => void bookings.refetch()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  status: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  lines: { marginTop: spacing.xs, gap: 2 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, flexWrap: 'wrap' },
});
