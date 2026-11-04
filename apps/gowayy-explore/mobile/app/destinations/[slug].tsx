import { useQuery } from '@tanstack/react-query';
import { Linking, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { client, handoff } from '../../src/lib/client';
import { Body, Button, Card, H1, H2, Screen } from '../../src/components/UI';
import { spacing } from '../../src/theme';
import type { Destination } from '@gowayy/types';

export default function DestinationDetail() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const catalog = useQuery({ queryKey: ['catalog'], queryFn: () => client.catalog() });
  const d = (catalog.data?.destinations ?? []).find((x) => (x as Destination).slug === slug) as Destination | undefined;
  const attractions = (catalog.data?.attractions ?? []).filter((a) => a.destinationId === d?.id);

  if (!d) return <Screen><H1>Destination</H1><Body muted>Loading…</Body></Screen>;

  return (
    <Screen>
      <H1>{d.name}</H1>
      <Body muted>{d.region}, {d.state} · {d.bestSeason ?? 'Year round'} · {d.coordinateAccuracy === 'published' ? 'Published coordinates' : 'Approximate coordinates'}</Body>
      <Card><Body>{d.description}</Body></Card>
      <H2>Attractions</H2>
      <View style={{ gap: spacing.sm }}>
        {attractions.map((a) => <Card key={a.id}><Body>{a.name}</Body><Body muted>{a.category} · ~{a.typicalVisitMinutes} min</Body></Card>)}
        {attractions.length === 0 && <Body muted>No verified attractions listed yet.</Body>}
      </View>
      <H2>Book this trip</H2>
      <View style={{ gap: spacing.sm }}>
        <Button label="Stays in GOWAYY" onPress={() => void Linking.openURL(handoff('/hotels'))} />
        <Button variant="secondary" label="Cabs from the airport" onPress={() => void Linking.openURL(handoff('/cabs'))} />
        <Button variant="secondary" label="Food & groceries" onPress={() => void Linking.openURL(handoff('/food'))} />
        <Button variant="ghost" label="Tourism packages" onPress={() => void Linking.openURL(handoff('/packages'))} />
      </View>
      <Body muted>Photos shown only where the exact subject and licence were verified; otherwise an honest placeholder is shown.</Body>
    </Screen>
  );
}
