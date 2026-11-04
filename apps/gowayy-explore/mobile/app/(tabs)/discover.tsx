import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { FlatList } from 'react-native';
import { client } from '../../src/lib/client';
import { Body, Card, EmptyState, H1, Screen } from '../../src/components/UI';
import { spacing } from '../../src/theme';
import type { Destination } from '@gowayy/types';

export default function Discover() {
  const router = useRouter();
  const catalog = useQuery({ queryKey: ['catalog'], queryFn: () => client.catalog() });
  const destinations = (catalog.data?.destinations ?? []) as Destination[];

  return (
    <Screen>
      <H1>Discover the Himalaya</H1>
      <Body muted>Verified destinations with real, licensed photographs. Tap one for attractions, routes and booking handoff.</Body>
      {catalog.isLoading && <Body muted>Loading destinations…</Body>}
      {!catalog.isLoading && destinations.length === 0 && <EmptyState title="No data" body="Could not load the catalogue from the shared backend." />}
      <FlatList
        data={destinations.filter((d) => !d.hiddenGem)}
        keyExtractor={(d) => d.id}
        contentContainerStyle={{ gap: spacing.md }}
        renderItem={({ item }) => (
          <Card onPress={() => router.push(`/destinations/${item.slug}`)}>
            <Body>{item.name}</Body>
            <Body muted>{item.region}, {item.state} · best: {item.bestSeason ?? 'year-round'}</Body>
          </Card>
        )}
      />
    </Screen>
  );
}
