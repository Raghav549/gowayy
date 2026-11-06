import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { client } from '../../src/lib/client';
import { useUI } from '../../src/store/useUI';
import { Button, Card, EmptyState, Screen, SectionTitle, SkeletonList } from '../../src/components/UI';
import { useTheme, spacing, radius, font } from '../../src/theme';
import type { Order } from '@gowayy/types';

export default function OrdersScreen() {
  const router = useRouter();
  const { c } = useTheme();
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const [busyId, setBusyId] = useState<string | null>(null);
  const orders = useQuery({ queryKey: ['orders'], queryFn: () => client.orders() });

  async function cancel(o: Order) {
    setBusyId(o.id);
    try { await client.transitionOrder(o.id, 'cancelled'); await qc.invalidateQueries({ queryKey: ['orders'] }); showToast('Order cancelled and stock/payment reconciled on the server.'); }
    catch (e) { showToast(e instanceof Error ? e.message : 'Cancellation failed.'); }
    finally { setBusyId(null); }
  }

  return (
    <Screen>
      <SectionTitle eyebrow="Account" title="Food & grocery orders" />
      {orders.isLoading ? <SkeletonList rows={4} /> : null}
      {orders.data?.length === 0 ? <EmptyState title="No orders yet" body="Browse a restaurant menu or a local grocery store to place your first order."
        action={<Button title="Browse food" onPress={() => router.push('/food')} />} /> : null}
      {orders.data?.map((o) => (
        <Card key={o.id}>
          <View style={styles.head}>
            <Text style={{ color: c.text, fontWeight: '700', flex: 1 }}>{o.service === 'food' ? 'Restaurant order' : 'Grocery order'}</Text>
            <View style={[styles.status, { borderColor: c.accent }]}><Text style={{ color: c.accent, fontSize: font.sizes.xs }}>{o.status.replace(/_/g, ' ')}</Text></View>
          </View>
          <Text style={{ color: c.textMuted, fontSize: font.sizes.xs }}>{o.reference} · {new Date(o.createdAt).toLocaleString()}</Text>
          {o.items.map((i, n) => <Text key={n} style={{ color: c.text, fontSize: font.sizes.sm }}>{i.quantity} × {i.name} · ₹{((i.unitPricePaise * i.quantity) / 100).toFixed(2)}</Text>)}
          <Text style={{ color: c.accent, fontWeight: '700' }}>Total ₹{(o.price.totalPaise / 100).toFixed(2)}</Text>
          <Text style={{ color: c.textMuted, fontSize: font.sizes.xs }}>Deliver to: {o.deliveryAddress}</Text>
          <View style={styles.actions}>
            <Button title="Payment" variant="secondary" onPress={() => router.push({ pathname: '/checkout', params: { orderId: o.id } })} />
            {!['cancelled', 'refunded', 'delivered'].includes(o.status) ? <Button title="Cancel" variant="danger" loading={busyId === o.id} onPress={() => void cancel(o)} /> : null}
          </View>
        </Card>
      ))}
      <Button title="Refresh" variant="ghost" onPress={() => void orders.refetch()} />
    </Screen>
  );
}
const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  status: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, flexWrap: 'wrap' },
});
