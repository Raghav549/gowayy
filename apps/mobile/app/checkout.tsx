/** Sandbox payment flow. Client-side success is never trusted as confirmation. */
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { client, idemKey } from '../src/lib/client';
import { Button, Card, DemoBanner, Picker, Screen, SectionTitle } from '../src/components/UI';
import { useTheme, spacing, font } from '../src/theme';
import type { Booking, Order, PriceBreakdown, Payment } from '@gowayy/types';

type CheckoutRecord =
  | { booking: Booking; payment: Payment | null }
  | { order: Order; payment: Payment | null };

export default function CheckoutScreen() {
  const params = useLocalSearchParams<{ bookingId?: string; orderId?: string }>();
  const router = useRouter();
  const { c } = useTheme();
  const qc = useQueryClient();
  const [method, setMethod] = useState('upi');
  const [payment, setPayment] = useState<Payment | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sandboxNote, setSandboxNote] = useState<string | null>(null);

  const record = useQuery({
    queryKey: ['checkout-record', params.bookingId, params.orderId],
    queryFn: async (): Promise<CheckoutRecord> => params.orderId ? client.order(params.orderId) : client.booking(params.bookingId!),
    enabled: Boolean(params.bookingId || params.orderId),
  });
  const price: PriceBreakdown | undefined = record.data && ('booking' in record.data ? record.data.booking.price : record.data.order.price);
  const reference = record.data && ('booking' in record.data ? record.data.booking.reference : record.data.order.reference);
  const transactions = useQuery({ queryKey: ['transactions'], queryFn: () => client.transactions() });

  async function initiate() {
    if (!price) return;
    setBusy(true); setError(null);
    try {
      const p = await client.initPayment({
        bookingId: params.bookingId ?? null, orderId: params.orderId ?? null,
        method, amountPaise: price.totalPaise, idempotencyKey: idemKey(),
      });
      setPayment(p);
      await qc.invalidateQueries({ queryKey: ['transactions'] });
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not start payment.'); }
    finally { setBusy(false); }
  }
  async function capture() {
    if (!payment) return;
    setBusy(true); setError(null);
    try {
      const r = await client.captureSandboxPayment(payment.id);
      setPayment(r.payment);
      setSandboxNote(r.note ?? 'DEMO SANDBOX CAPTURE — no real payment was made.');
      await qc.invalidateQueries({ queryKey: ['bookings'] });
      await qc.invalidateQueries({ queryKey: ['orders'] });
      await qc.invalidateQueries({ queryKey: ['transactions'] });
    } catch (e) { setError(e instanceof Error ? e.message : 'Capture failed.'); }
    finally { setBusy(false); }
  }
  async function refund() {
    if (!payment) return;
    setBusy(true);
    try {
      const r = await client.refundPayment(payment.id, true, 'Customer requested refund');
      setPayment(r.payment);
      await qc.invalidateQueries({ queryKey: ['transactions'] });
    } catch (e) { setError(e instanceof Error ? e.message : 'Refund failed.'); }
    finally { setBusy(false); }
  }

  return (
    <Screen>
      <SectionTitle eyebrow="Secure checkout" title="Payment" />
      <DemoBanner>DEVELOPMENT SANDBOX. No real money moves. In production, capture only succeeds after a signature-verified payment webhook; a client-side "success" never confirms a booking.</DemoBanner>
      {record.isLoading ? <Text style={{ color: c.textMuted }}>Loading record…</Text> : null}
      {record.data ? <Card>
        <Text style={{ color: c.text, fontWeight: '700' }}>{reference}</Text>
        <Text style={{ color: c.textMuted, fontSize: font.sizes.xs }}>Status: {'booking' in record.data ? record.data.booking.status : record.data.order.status} (server-authoritative)</Text>
        <View style={styles.lines}>
          {price?.lines.map((l, i) => <Text key={i} style={{ color: c.textMuted, fontSize: font.sizes.sm }}>{l.label}: ₹{(l.paise / 100).toFixed(2)}</Text>)}
          <Text style={{ color: c.textMuted, fontSize: font.sizes.sm }}>GST: ₹{((price?.taxPaise ?? 0) / 100).toFixed(2)} · Commission: ₹{((price?.commissionPaise ?? 0) / 100).toFixed(2)}</Text>
          <Text style={{ color: c.accent, fontWeight: '800', fontSize: font.sizes.lg }}>Total: ₹{((price?.totalPaise ?? 0) / 100).toFixed(2)}</Text>
        </View>
      </Card> : null}

      <Picker label="Payment method" options={[
        { id: 'upi', label: 'UPI' }, { id: 'upi_intent', label: 'UPI Intent' }, { id: 'gateway', label: 'Gateway' }, { id: 'cash', label: 'Cash (where permitted)' },
      ]} value={method} onChange={setMethod} />
      {!payment ? <Button title="Initiate sandbox payment" loading={busy} onPress={() => void initiate()} /> : <Card>
        <Text style={[styles.eyebrow, { color: c.accent }]}>PAYMENT STATUS</Text>
        <Text style={{ color: c.text, fontSize: font.sizes.lg, fontWeight: '700' }}>{payment.status.replace(/_/g, ' ')}</Text>
        <Text style={{ color: c.textMuted, fontSize: font.sizes.xs }}>{payment.id} · idempotency key {payment.idempotencyKey}</Text>
        {payment.status === 'requires_action' ? <Button title="Simulate verified capture (demo)" loading={busy} onPress={() => void capture()} /> : null}
        {payment.status === 'captured' ? <Button title="Request refund" variant="secondary" loading={busy} onPress={() => void refund()} /> : null}
      </Card>}
      {sandboxNote ? <DemoBanner>{sandboxNote}</DemoBanner> : null}
      {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}

      <SectionTitle eyebrow="Ledger" title="Transactions" />
      {(transactions.data ?? []).slice(0, 8).map((t) => <Card key={t.id}>
        <Text style={{ color: c.text }}>{t.type} · ₹{(t.amountPaise / 100).toFixed(2)}</Text>
        <Text style={{ color: c.textMuted, fontSize: font.sizes.xs }}>{t.note}</Text>
      </Card>)}
      {(transactions.data ?? []).length === 0 ? <Text style={{ color: c.textMuted, fontSize: font.sizes.sm }}>No transactions yet.</Text> : null}
      <View style={styles.links}>
        <Button title="View bookings" variant="secondary" onPress={() => router.push('/bookings')} />
        <Button title="View orders" variant="secondary" onPress={() => router.push('/orders')} />
        <Button title="Back home" variant="ghost" onPress={() => router.push('/home')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  eyebrow: { fontSize: font.sizes.xs, letterSpacing: 1.5, fontWeight: '700' },
  lines: { marginTop: spacing.sm, gap: 2 },
  error: { color: '#B45B4C', fontSize: font.sizes.sm },
  links: { gap: spacing.sm, marginTop: spacing.md, marginBottom: spacing.xl },
});
