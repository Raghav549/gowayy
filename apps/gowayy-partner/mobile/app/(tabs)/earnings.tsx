import { Alert } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { client } from '../../src/lib/client';
import { Body, Button, Card, H1, H2, Row, Screen } from '../../src/components/UI';
import { formatINR } from '@gowayy/shared-utils';

export default function Earnings() {
  const qc = useQueryClient();
  const earnings = useQuery({ queryKey: ['partner-earnings'], queryFn: () => client.partnerEarnings() });
  const settlements = useQuery({ queryKey: ['partner-settlements'], queryFn: () => client.partnerSettlements().catch(() => ({ items: [] as unknown[] })) });
  const request = useMutation({
    mutationFn: () => client.requestSettlement(),
    onSuccess: () => { Alert.alert('Requested', 'Settlement request recorded. Payouts happen on the server schedule.'); void qc.invalidateQueries({ queryKey: ['partner-earnings'] }); },
    onError: (e: Error) => Alert.alert('Cannot settle', e.message),
  });

  const data = earnings.data as { totalGrossPaise?: number; totalNetPaise?: number; settledPaise?: number; rows?: unknown[] } | undefined;

  return (
    <Screen>
      <H1>Earnings</H1>
      <Card>
        <H2>Ledger</H2>
        <Row between><Body muted>Gross</Body><Body>{formatINR(data?.totalGrossPaise ?? 0)}</Body></Row>
        <Row between><Body muted>Platform commission (15%)</Body><Body>−{formatINR((data?.totalGrossPaise ?? 0) - (data?.totalNetPaise ?? 0))}</Body></Row>
        <Row between><Body>Net to you</Body><H2>{formatINR(data?.totalNetPaise ?? 0)}</H2></Row>
        <Body muted>Every row comes from a captured, webhook-verified payment on your own listings/jobs. Already settled: {formatINR(data?.settledPaise ?? 0)}.</Body>
      </Card>
      <Card>
        <H2>Settlements</H2>
        <Body muted>{(settlements.data as { items?: unknown[] } | undefined)?.items?.length ?? 0} request(s) on record.</Body>
        <Button label="Request settlement" onPress={() => request.mutate()} disabled={request.isPending} />
      </Card>
    </Screen>
  );
}
