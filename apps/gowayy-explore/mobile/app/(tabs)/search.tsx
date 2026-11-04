import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { client } from '../../src/lib/client';
import { Body, Button, Card, H1, Input, Screen } from '../../src/components/UI';
import { spacing } from '../../src/theme';

export default function Search() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const results = useQuery({ queryKey: ['search', q], queryFn: () => client.search(q), enabled: q.trim().length > 1 });

  return (
    <Screen>
      <H1>Search</H1>
      <View style={{ gap: spacing.sm }}>
        <Input label="Where to?" value={q} onChangeText={setQ} placeholder="Darjeeling, momos, taxi…" />
        <Button label="Search" onPress={() => undefined} disabled={q.trim().length <= 1} />
      </View>
      <FlatList
        data={(results.data ?? []) as { kind: string; id: string; title: string; subtitle: string; href: string }[]}
        keyExtractor={(h) => `${h.kind}-${h.id}`}
        contentContainerStyle={{ gap: spacing.sm }}
        renderItem={({ item }) => (
          <Card onPress={() => router.push(item.href as never)}>
            <Body>{item.title}</Body>
            <Body muted>{item.subtitle} · {item.kind.replace('_', ' ')}</Body>
          </Card>
        )}
      />
    </Screen>
  );
}
