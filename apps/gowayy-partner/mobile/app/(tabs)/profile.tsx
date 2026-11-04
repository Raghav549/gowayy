import { Alert, View } from 'react-native';
import { useRouter } from 'expo-router';
import { client, tokenStore } from '../../src/lib/client';
import { useSession } from '../../src/store';
import { Body, Button, Card, H1, Screen } from '../../src/components/UI';
import { spacing } from '../../src/theme';

export default function Profile() {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const setSession = useSession((s) => s.setSession);

  const signOut = async () => {
    await client.logout().catch(() => undefined);
    tokenStore.set(null);
    setSession(null, null);
    router.replace('/auth/login');
  };
  const deleteAccount = () => {
    Alert.alert('Delete account', 'This permanently deletes your account and data. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await client.deleteAccount(); } catch { /* server-authoritative regardless */ }
        tokenStore.set(null); setSession(null, null); router.replace('/auth/login');
        Alert.alert('Deleted', 'Your account was deleted server-side.');
      } },
    ]);
  };

  return (
    <Screen>
      <H1>Profile</H1>
      <Card>
        <Body>{user ? `${user.firstName} ${user.lastName}` : '—'}</Body>
        <Body muted>{user?.email ?? ''}</Body>
      </Card>
      <View style={{ gap: spacing.sm }}>
        <Button variant="secondary" label="Sign out" onPress={() => void signOut()} />
        <Button variant="ghost" label="Delete account" onPress={deleteAccount} />
      </View>
    </Screen>
  );
}
