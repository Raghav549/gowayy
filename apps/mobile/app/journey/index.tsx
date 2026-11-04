/** Resolves the active journey and opens its dashboard. */
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useJourney } from '../../src/store/useJourney';
import { useTheme } from '../../src/theme';
import { Button, Screen, EmptyState } from '../../src/components/UI';

export default function JourneyIndex() {
  const router = useRouter();
  const { c } = useTheme();
  const journey = useJourney((s) => s.journey);
  const ensure = useJourney((s) => s.ensure);
  const loading = useJourney((s) => s.loading);
  useEffect(() => { void ensure(); }, [ensure]);
  useEffect(() => { if (journey) router.replace({ pathname: '/journey/[id]', params: { id: journey.id } }); }, [journey, router]);
  if (loading || !journey) return (
    <Screen>
      {loading ? <View style={styles.center}><ActivityIndicator color={c.accent} /></View> :
        <EmptyState title="No active journey" body="Choose a destination to create a connected journey."
          action={<Button title="Explore destinations" onPress={() => router.push('/explore')} />} />}
    </Screen>
  );
  return <View style={[styles.center, { backgroundColor: c.bg }]}><ActivityIndicator color={c.accent} /></View>;
}
const styles = StyleSheet.create({ center: { flex: 1, alignItems: 'center', justifyContent: 'center' } });
