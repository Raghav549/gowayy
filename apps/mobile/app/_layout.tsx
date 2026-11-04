import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AccessibilityInfo } from 'react-native';
import { hydrateStorage } from '../src/lib/storage';
import { useUI } from '../src/store/useUI';
import { useSession } from '../src/store/useSession';
import { useTheme, spacing, radius, font } from '../src/theme';
import { requestPushPermission, useNotificationPolling } from '../src/lib/notifications';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: false } },
});

function Toast() {
  const toast = useUI((s) => s.toast);
  const clearToast = useUI((s) => s.clearToast);
  const { c } = useTheme();
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(clearToast, 3600);
    return () => clearTimeout(t);
  }, [toast, clearToast]);
  if (!toast) return null;
  return (
    <View style={[styles.toast, { backgroundColor: c.raised, borderColor: c.accent }]} accessibilityRole="alert">
      <Text style={{ color: c.text, fontSize: font.sizes.sm }}>{toast}</Text>
    </View>
  );
}

function Shell() {
  const { c, mode } = useTheme();
  useNotificationPolling();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: c.bg },
          headerTintColor: c.text,
          headerTitleStyle: { fontWeight: '700', color: c.text },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: c.bg },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="splash" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="auth" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="destinations" options={{ headerShown: false }} />
        <Stack.Screen name="journey" options={{ headerShown: false }} />
        <Stack.Screen name="checkout" options={{ title: 'Payment' }} />
        <Stack.Screen name="partner" options={{ title: 'Partner mode' }} />
        <Stack.Screen name="credits" options={{ title: 'Image credits' }} />
        <Stack.Screen name="support" options={{ title: 'Support' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      </Stack>
      <Toast />
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    void (async () => {
      await hydrateStorage();
      useUI.getState().rehydrate();
      await useSession.getState().hydrate();
      const reduced = await AccessibilityInfo.isReduceMotionEnabled().catch(() => false);
      if (live) useUI.getState().setReducedMotion(Boolean(reduced));
      void requestPushPermission();
      if (live) setReady(true);
    })();
    return () => { live = false; };
  }, []);
  const { c } = useTheme();
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        {ready ? <Shell /> : (
          <View style={[styles.boot, { backgroundColor: c.bg }]}>
            <ActivityIndicator color={c.accent} />
            <Text style={{ color: c.textMuted, marginTop: spacing.md }}>Preparing GOWAYY…</Text>
          </View>
        )}
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  boot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  toast: { position: 'absolute', bottom: 96, left: spacing.lg, right: spacing.lg, padding: spacing.md, borderWidth: 1, borderRadius: radius.sm, zIndex: 100 },
});
