import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { client, restoreToken } from '../src/lib/client';
import { checkForStartupUpdate } from '../src/lib/app-updates';
import { useSession } from '../src/store';
import { colors } from '../src/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 15_000 } } });


function StartupUpdatePrompt() {
  const router = useRouter();
  useEffect(() => {
    let active = true;
    void checkForStartupUpdate().then((update) => {
      if (!active || !update) return;
      Alert.alert(
        'App update available',
        `Version ${update.versionName} is ready. You can review the release notes and download it now.`,
        [
          { text: 'Later', style: 'cancel' },
          { text: 'View update', onPress: () => router.push('/update') },
        ],
      );
    }).catch(() => undefined);
    return () => { active = false; };
  }, [router]);
  return null;
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const setSession = useSession((s) => s.setSession);

  useEffect(() => {
    (async () => {
      try {
        const token = await restoreToken();
        if (token) {
          const me = await client.me().catch(() => null);
          if (me) setSession(me as never, token);
        }
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
      <StartupUpdatePrompt />
      <Stack screenOptions={{ headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="update" options={{ title: 'App updates' }} />
        <Stack.Screen name="auth/login" options={{ title: 'Partner sign in' }} />
        <Stack.Screen name="auth/register" options={{ title: 'Become a partner' }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </QueryClientProvider>
  );
}
