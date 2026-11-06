import { useState } from 'react';
import { Alert, Switch, Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NotificationPreferences } from '@gowayy/types';
import { useRouter } from 'expo-router';
import { client, tokenStore } from '../../src/lib/client';
import { useSession } from '../../src/store';
import { Body, Button, Card, H1, Screen } from '../../src/components/UI';
import { spacing, colors } from '../../src/theme';
import { registerNativePush, unregisterNativePush } from '../../src/lib/notifications';

export default function Profile() {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const setSession = useSession((s) => s.setSession);
  const qc = useQueryClient();
  const [pushBusy, setPushBusy] = useState(false);
  const [pushStatus, setPushStatus] = useState('Register only after reviewing the notification permission request.');
  const preferences = useQuery({ queryKey: ['notification-preferences'], queryFn: () => client.notificationPreferences(), retry: 0 });
  const preferenceRows: Array<{ key: keyof Omit<NotificationPreferences, 'updatedAt'>; label: string }> = [
    { key: 'pushEnabled', label: 'Push notifications' }, { key: 'partnerUpdates', label: 'Partner updates' },
    { key: 'orderUpdates', label: 'Order updates' }, { key: 'bookingUpdates', label: 'Booking updates' },
    { key: 'paymentUpdates', label: 'Payment updates' }, { key: 'marketing', label: 'Marketing' },
  ];
  const updatePreference = async (key: keyof Omit<NotificationPreferences, 'updatedAt'>, value: boolean) => {
    setPushBusy(true);
    try { const next = await client.updateNotificationPreferences({ [key]: value }); qc.setQueryData(['notification-preferences'], next); }
    catch (error) { Alert.alert('Preference not saved', error instanceof Error ? error.message : 'Try again.'); }
    finally { setPushBusy(false); }
  };
  const enablePush = async () => {
    setPushBusy(true);
    try { await registerNativePush(true); setPushStatus('Server registration confirmed. Provider delivery has not been tested by this action.'); }
    catch (error) { const message = error instanceof Error ? error.message : 'Registration failed.'; setPushStatus(message); Alert.alert('Push not enabled', message); }
    finally { setPushBusy(false); }
  };
  const disablePush = async () => {
    setPushBusy(true);
    try { await unregisterNativePush(); setPushStatus('This installation was unregistered on the server.'); }
    catch (error) { Alert.alert('Could not unregister', error instanceof Error ? error.message : 'Try again.'); }
    finally { setPushBusy(false); }
  };

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
        try {
          await client.deleteAccount();
          tokenStore.set(null); setSession(null, null); router.replace('/auth/login');
          Alert.alert('Deleted', 'Your account was deleted server-side.');
        } catch (error) {
          Alert.alert('Account not deleted', error instanceof Error ? error.message : 'The server could not delete the account. Your session is unchanged.');
        }
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
      <Card>
        <Body>Push notifications</Body>
        <Body muted>Registration requires server configuration and OS permission. Category changes are saved separately.</Body>
        {preferences.data ? preferenceRows.map(({ key, label }) => <View key={key} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, minHeight: 44 }}>
          <Text style={{ flex: 1, color: colors.text }}>{label}</Text>
          <Switch value={preferences.data[key]} disabled={pushBusy || (key !== 'pushEnabled' && !preferences.data.pushEnabled)} onValueChange={(value) => void updatePreference(key, value)}
            trackColor={{ false: '#D8D0DE', true: '#BFA5D8' }} thumbColor={preferences.data[key] ? colors.accent : '#F7F4F8'} />
        </View>) : <Body muted>{preferences.isError ? (preferences.error instanceof Error ? preferences.error.message : 'Preferences unavailable.') : 'Loading preferences…'}</Body>}
        <Button label="Enable push on this device" onPress={() => void enablePush()} disabled={pushBusy} />
        <Button variant="secondary" label="Unregister this device" onPress={() => void disablePush()} disabled={pushBusy} />
        <Body muted>{pushStatus}</Body>
      </Card>
      <View style={{ gap: spacing.sm }}>
        <Button variant="secondary" label="Check for app updates" onPress={() => router.push('/update')} />
        <Button variant="secondary" label="Sign out" onPress={() => void signOut()} />
        <Button variant="ghost" label="Delete account" onPress={deleteAccount} />
      </View>
    </Screen>
  );
}
