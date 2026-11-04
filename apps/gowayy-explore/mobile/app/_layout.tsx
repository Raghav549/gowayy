import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { client, restoreToken } from '../src/lib/client';
import { useSession } from '../src/store';
import { colors } from '../src/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 } } });

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const setSession = useSession((s) => s.setSession);

  useEffect(() => {
    (async () => {
      try {
        const token = await restoreToken();
        if (token) { const me = await client.me().catch(() => null); if (me) setSession(me as never, token); }
      } finally {
        setReady(true);
        await SplashScreen.hideAsync().catch(() => undefined);
      }
    })();
  }, [setSession]);

  if (!ready) return null;
  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="auth/login" options={{ title: 'Sign in' }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="destinations/[slug]" options={{ title: 'Destination' }} />
      </Stack>
    </QueryClientProvider>
  );
}
