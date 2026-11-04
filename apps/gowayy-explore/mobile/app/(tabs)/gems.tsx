import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { FlatList } from 'react-native';
import { client } from '../../src/lib/client';
import { Body, Card, EmptyState, H1, Screen } from '../../src/components/UI';
import { spacing } from '../../src/theme';
import type { HiddenGem } from '@gowayy/types';

export default function Gems() {
  const router = useRouter();
  const catalog = useQuery({ queryKey: ['catalog'], queryFn: () => client.catalog() });
  const gems = (catalog.data?.hiddenGems ?? []) as HiddenGem[];

  return (
    <Screen>
      <H1>Hidden gems</H1>
      <Body muted>Verified coordinates, access notes and safety warnings. Approximate pins are marked as approximate.</Body>
      {gems.length === 0 && !catalog.isLoading && <EmptyState title="No gems" body="Hidden gems will appear here once verified." />}
      <FlatList
        data={gems}
        keyExtractor={(g) => g.id}
        contentContainerStyle={{ gap: spacing.md }}
        renderItem={({ item }) => (
          <Card>
            <Body>{item.name}</Body>
            <Body muted>Route: {item.route}{item.safetyWarnings?.length ? ` · ⚠ ${item.safetyWarnings[0]}` : ''}</Body>
          </Card>
        )}
      />
    </Screen>
  );
}
