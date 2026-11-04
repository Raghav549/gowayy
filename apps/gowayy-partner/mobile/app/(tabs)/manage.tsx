import { useState } from 'react';
import { Alert, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { client } from '../../src/lib/client';
import { Body, Button, Card, H1, H2, Input, Screen } from '../../src/components/UI';
import { spacing } from '../../src/theme';

const ROLES = [
  { role: 'driver', label: 'Driver', listingId: null },
  { role: 'restaurant', label: 'Restaurant', listingId: 'rst_1' },
  { role: 'grocery', label: 'Grocery store', listingId: 'grc_1' },
  { role: 'property', label: 'Hotel / homestay', listingId: 'prp_1' },
  { role: 'tour_operator', label: 'Tour operator', listingId: null },
] as const;

export default function Manage() {
  const qc = useQueryClient();
  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
  const requests = useQuery({ queryKey: ['partner-requests'], queryFn: () => client.partnerRequests().catch(() => ({ bookings: [], orders: [], claimedListings: [] as { role: string }[] })) });
  const claim = useMutation({
    mutationFn: (role: string) => client.claimPartner(role, ROLES.find((r) => r.role === role)?.listingId ?? ''),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['partner-requests'] }); Alert.alert('Claimed', 'Role added to your account. Verification is demo-labelled in this build.'); },
    onError: (e: Error) => Alert.alert('Claim failed', e.message),
  });
  const profile = useMutation({
    mutationFn: () => client.updatePartnerProfile({ businessName, phone }),
    onSuccess: () => { Alert.alert('Saved', 'Business profile updated.'); },
    onError: (e: Error) => Alert.alert('Save failed', e.message),
  });

  const myRoles = (requests.data?.claimedListings as { role: string }[] | undefined)?.map((c) => c.role) ?? [];

  return (
    <Screen>
      <H1>Manage</H1>
      <Card>
        <H2>Business profile</H2>
        <Input label="Business name" value={businessName} onChangeText={setBusinessName} placeholder="e.g. Hill View Homestay" />
        <Input label="Phone" value={phone} onChangeText={setPhone} placeholder="+91…" />
        <Button label="Save profile" onPress={() => profile.mutate()} disabled={!businessName} />
      </Card>
      <Card>
        <H2>Claim a service role</H2>
        <View style={{ gap: spacing.sm }}>
          {ROLES.map((r) => (
            <Button key={r.role} variant={myRoles.includes(r.role) ? 'secondary' : 'primary'} disabled={myRoles.includes(r.role) || claim.isPending}
              label={myRoles.includes(r.role) ? `${r.label} — claimed` : `Claim ${r.label}`} onPress={() => claim.mutate(r.role)} />
          ))}
        </View>
        <Body muted>Document verification in this build is a labelled demo adapter — it never claims real verification.</Body>
      </Card>
    </Screen>
  );
}
