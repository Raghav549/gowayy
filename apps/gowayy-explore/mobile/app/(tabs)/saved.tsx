import { useQuery } from '@tanstack/react-query';
import { Linking, View } from 'react-native';
import { client, handoff } from '../../src/lib/client';
import { Body, Button, Card, EmptyState, H1, Screen } from '../../src/components/UI';
import { spacing } from '../../src/theme';

export default function Saved() {
  const saved = useQuery({ queryKey: ['saved-places'], queryFn: () => client.savedPlaces().catch(() => [] as unknown[]) });
  const items = (saved.data ?? []) as { id: string; name: string }[];

  return (
    <Screen>
      <H1>Saved</H1>
      {items.length === 0 ? (
        <EmptyState title="Nothing saved yet" body="Sign in to sync saved places across GOWAYY and EXPLORE." />
      ) : (
        <View style={{ gap: spacing.sm }}>
          {items.map((s) => <Card key={s.id}><Body>{s.name}</Body></Card>)}
        </View>
      )}
      <Card>
        <Body muted>Ready to book? Hand off to the GOWAYY customer app — your saved context travels with you.</Body>
        <Button label="Open GOWAYY" onPress={() => void Linking.openURL(handoff('/'))} />
      </Card>
    </Screen>
  );
}
