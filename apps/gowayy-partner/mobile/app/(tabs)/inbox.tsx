import { useQuery } from '@tanstack/react-query';
import { FlatList, View } from 'react-native';
import { client } from '../../src/lib/client';
import { Body, Card, EmptyState, H1, Screen } from '../../src/components/UI';
import { spacing } from '../../src/theme';

interface InboxItem { kind: string; title: string; sub: string; at: string }

export default function Inbox() {
  const inbox = useQuery({ queryKey: ['partner-inbox'], queryFn: () => client.partnerInbox() });
  const raw = (inbox.data ?? {}) as { bookings?: { reference: string; service: string; status: string }[]; orders?: { reference: string; service: string; status: string }[] };
  const items: InboxItem[] = [
    ...(raw.bookings ?? []).map((b) => ({ kind: 'booking', title: `${b.reference} · ${b.service}`, sub: `Status: ${b.status}`, at: '' })),
    ...(raw.orders ?? []).map((o) => ({ kind: 'order', title: `${o.reference} · ${o.service}`, sub: `Status: ${o.status}`, at: '' })),
  ];

  return (
    <Screen>
      <H1>Inbox</H1>
      <Body muted>Bookings, orders and notifications for your services — updated in real time.</Body>
      {items.length === 0 && !inbox.isLoading && <EmptyState title="All clear" body="No new requests right now." />}
      <FlatList
        data={items}
        keyExtractor={(x, i) => `${x.kind}-${i}`}
        contentContainerStyle={{ gap: spacing.sm }}
        renderItem={({ item }) => (
          <Card>
            <View style={{ gap: spacing.xs }}>
              <Body>{item.title}</Body>
              <Body muted>{item.sub}</Body>
              <Body muted>{item.at}</Body>
            </View>
          </Card>
        )}
      />
    </Screen>
  );
}
