import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { hydrateStorage } from '../src/lib/storage';
import { checkForStartupUpdate } from '../src/lib/app-updates';
import { useUI } from '../src/store/useUI';
import { useSession } from '../src/store/useSession';
import { useTheme, spacing, radius, font } from '../src/theme';
import { useNativePushRegistration, useNotificationPolling } from '../src/lib/notifications';

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

function Shell() {
  const { c } = useTheme();
  useNotificationPolling();
  useNativePushRegistration();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="dark" />
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
        <Stack.Screen name="update" options={{ title: 'App updates' }} />
      </Stack>
      <StartupUpdatePrompt />
      <Toast />
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  const [hydrated, setHydrated] = useState(false);
  const [animationDone, setAnimationDone] = useState(false);
  const reveal = useRef(new Animated.Value(0)).current;
  const { c } = useTheme();
  useEffect(() => {
    let live = true;
    void (async () => {
      const reduced = await AccessibilityInfo.isReduceMotionEnabled().catch(() => false);
      if (!live) return;
      useUI.getState().setReducedMotion(Boolean(reduced));
      Animated.timing(reveal, {
        toValue: 1,
        duration: reduced ? 1 : 1050,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => { if (live) setAnimationDone(true); });
      try {
        await hydrateStorage();
        useUI.getState().rehydrate();
        await useSession.getState().hydrate();
      } finally {
        if (live) setHydrated(true);
      }
    })().catch(() => { if (live) setHydrated(true); });
    return () => { live = false; };
  }, [reveal]);
  if (hydrated && animationDone) return <SafeAreaProvider><QueryClientProvider client={queryClient}><Shell /></QueryClientProvider></SafeAreaProvider>;
  const size = 148;
  const scale = reveal.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] });
  return (
    <View style={[styles.boot, { backgroundColor: c.bg }]}>
      <Animated.View style={{ width: size, height: size, opacity: reveal, transform: [{ scale }] }}>
        <Image source={require('../assets/branding/splash-mark.png')} style={styles.mark} contentFit="contain" accessibilityLabel="" />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  boot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  mark: { width: '100%', height: '100%' },
  toast: { position: 'absolute', bottom: 96, left: spacing.lg, right: spacing.lg, padding: spacing.md, borderWidth: 1, borderRadius: radius.sm, zIndex: 100 },
});
