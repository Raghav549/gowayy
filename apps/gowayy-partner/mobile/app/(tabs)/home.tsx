import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { client } from '../../src/lib/client';
import { useSession } from '../../src/store';
import { Body, Button, Card, EmptyState, H1, H2, Row, Screen } from '../../src/components/UI';
import { colors, spacing } from '../../src/theme';

export default function PartnerHome() {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const overview = useQuery({ queryKey: ['partner-overview'], queryFn: () => client.partnerOverview() });
  const requests = useQuery({ queryKey: ['partner-requests'], queryFn: () => client.partnerRequests().catch(() => ({ bookings: [], orders: [], claimedListings: [] as unknown[] })) });

  if (!user) { router.replace('/auth/login'); return null; }
  const roles = (overview.data as { roles?: string[] } | undefined)?.roles ?? [];

  return (
    <Screen>
      <H1>Namaste, {user.firstName}</H1>
      <Body muted>GOWAYY PARTNER — your services across the Himalayan circuit, synced live with customer bookings.</Body>

      <Card>
        <H2>Your roles</H2>
        {roles.length === 0 ? (
          <>
            <Body muted>No partner role yet. Claim a listing to start.</Body>
            <Button label="Claim a business" onPress={() => router.push('/(tabs)/manage')} />
          </>
        ) : (
          <Row>{roles.map((r) => <View key={r} style={{ backgroundColor: colors.accentSoft, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: spacing.xs }}><Body>{r.replace('_', ' ')}</Body></View>)}</Row>
        )}
      </Card>

      <Card>
        <H2>Today</H2>
        <Body muted>{(requests.data?.claimedListings.length ?? 0) > 0 ? `${requests.data!.claimedListings.length} claimed listing(s) — manage them under Manage.` : `${requests.data?.bookings.length ?? 0} booking(s), ${requests.data?.orders.length ?? 0} order(s) in flight — details in Inbox.`}</Body>
        <Row>
          <Button label="Open inbox" onPress={() => router.push('/(tabs)/inbox')} />
          <Button variant="secondary" label="Earnings" onPress={() => router.push('/(tabs)/earnings')} />
        </Row>
      </Card>

      {!overview.data && <EmptyState title="Offline?" body="Could not reach the GOWAYY backend. Check EXPO_PUBLIC_GOWAYY_API_BASE_URL." />}
    </Screen>
  );
}
