import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { nativeTokenStore, registerAdminPush, unregisterAdminPush } from './src/lib/notifications';
import { WebView, type WebViewNavigation } from 'react-native-webview';

/**
 * GOWAYY ADMIN — Android shell.
 *
 * The console itself is the secured admin web app (apps/gowayy-admin/web). This
 * shell never contains admin credentials, business logic or API keys; it loads
 * the deployed console over HTTPS and lets the server enforce the admin role on
 * every request. Set EXPO_PUBLIC_ADMIN_URL at build time.
 */
const ADMIN_URL = (process.env.EXPO_PUBLIC_ADMIN_URL ?? '').trim();
const ADMIN_ORIGIN = (() => { try { return new URL(ADMIN_URL).origin; } catch { return ''; } })();
const AUTH_SYNC_SCRIPT = `(function(){try{window.ReactNativeWebView.postMessage(JSON.stringify({type:'GOWAYY_AUTH_TOKEN',token:window.localStorage.getItem('gowayy.session.token')}));}catch(e){}})();true;`;

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8F3FB' },
  fill: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, backgroundColor: '#F8F3FB' },
  loadingText: { color: '#6F6876', fontSize: 13 },
  setup: { flex: 1, justifyContent: 'center', padding: 24, gap: 14, backgroundColor: '#F8F3FB' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 38, height: 38, borderRadius: 10, backgroundColor: '#421080', alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { color: '#FFFFFF', fontWeight: '800', fontSize: 18 },
  brandWord: { fontWeight: '800', letterSpacing: 3, color: '#17131B' },
  brandTag: { fontSize: 10, letterSpacing: 2, color: '#421080', marginTop: 2 },
  title: { fontSize: 24, fontWeight: '700', color: '#17131B', marginTop: 8 },
  body: { fontSize: 14, lineHeight: 21, color: '#6F6876' },
  code: { fontFamily: Platform.select({ android: 'monospace', ios: 'Menlo', default: 'monospace' }), fontSize: 12, color: '#17131B', backgroundColor: '#F1EAF8', padding: 10, borderRadius: 8 },
  error: { borderWidth: 1, borderColor: '#E9E0F0', backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, gap: 8 },
  errorTitle: { fontWeight: '700', color: '#B94D59' },
  retry: { backgroundColor: '#421080', borderRadius: 999, paddingVertical: 12, alignItems: 'center' },
  retryText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  back: { position: 'absolute', left: 12, bottom: 18, backgroundColor: 'rgba(66,16,128,.86)', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  backText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
});

export default function App() {
  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [nativeAuthenticated, setNativeAuthenticated] = useState(false);

  const postPushStatus = useCallback((message: string, kind: 'success' | 'error' | 'info') => {
    const detail = JSON.stringify({ message, kind });
    webRef.current?.injectJavaScript(`window.dispatchEvent(new CustomEvent('gowayy-push-status',{detail:${detail}}));true;`);
  }, []);

  const onWebMessage = useCallback((event: { nativeEvent: { data: string; url: string } }) => {
    void (async () => {
      try {
        if (!ADMIN_ORIGIN || new URL(event.nativeEvent.url).origin !== ADMIN_ORIGIN) return;
        const message = JSON.parse(event.nativeEvent.data) as { type?: string; token?: string | null };
        if (message.type === 'GOWAYY_AUTH_TOKEN') {
          if (typeof message.token === 'string' && message.token.length > 0 && message.token.length <= 8192) {
            nativeTokenStore.set(message.token); setNativeAuthenticated(true);
          } else if (message.token === null) {
            if (nativeTokenStore.get()) await unregisterAdminPush().catch(() => undefined);
            nativeTokenStore.set(null); setNativeAuthenticated(false);
          }
          return;
        }
        if (message.type === 'GOWAYY_NATIVE_PUSH_REGISTER') {
          try {
            await registerAdminPush(true); setNativeAuthenticated(true);
            postPushStatus('Server registration confirmed. Actual provider delivery still requires a live push test.', 'success');
          } catch (error) { postPushStatus(error instanceof Error ? error.message : 'Native push registration failed.', 'error'); }
        }
        if (message.type === 'GOWAYY_NATIVE_PUSH_UNREGISTER') {
          try { await unregisterAdminPush(); postPushStatus('This Android installation was unregistered on the server.', 'info'); }
          catch (error) { postPushStatus(error instanceof Error ? error.message : 'Could not unregister this device.', 'error'); }
        }
      } catch { /* Ignore malformed or non-GOWAYY WebView messages. */ }
    })();
  }, [postPushStatus]);

  useEffect(() => {
    void SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!nativeAuthenticated || Platform.OS === 'web') return;
    void registerAdminPush(false).catch(() => undefined);
    const subscription = Notifications.addPushTokenListener(() => { void registerAdminPush(false).catch(() => undefined); });
    return () => subscription.remove();
  }, [nativeAuthenticated]);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const subscription = Notifications.addNotificationResponseReceivedListener(() => {
      webRef.current?.injectJavaScript("window.location.hash='support';true;");
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack) { webRef.current?.goBack(); return true; }
      Alert.alert('Leave GOWAYY Admin?', 'You will be signed out only if you choose to sign out in the console.', [
        { text: 'Stay', style: 'cancel' },
        { text: 'Exit', style: 'destructive', onPress: () => BackHandler.exitApp() },
      ]);
      return true;
    });
    return () => subscription.remove();
  }, [canGoBack]);

  const onNavigation = useCallback((state: WebViewNavigation) => setCanGoBack(state.canGoBack), []);

  if (!ADMIN_URL) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.root}>
          <StatusBar style="dark" />
          <View style={styles.setup}>
            <View style={styles.brandRow}>
              <View style={styles.brandMark}><Text style={styles.brandMarkText}>G</Text></View>
              <View><Text style={styles.brandWord}>GOWAYY</Text><Text style={styles.brandTag}>ADMIN</Text></View>
            </View>
            <Text style={styles.title}>Console URL not configured</Text>
            <Text style={styles.body}>
              This Android app is the secured shell for the GOWAYY Admin web console. Set the console URL when building the APK:
            </Text>
            <Text style={styles.code}>EXPO_PUBLIC_ADMIN_URL=https://your-admin-console.example</Text>
            <Text style={styles.body}>
              The URL must serve the admin console over HTTPS. Sign-in, roles and permissions are enforced by the backend; no administrator credentials are embedded in this app.
            </Text>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  if (!ADMIN_URL.startsWith('https://') && !__DEV__) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.root}>
          <View style={styles.setup}>
            <Text style={styles.title}>HTTPS required</Text>
            <Text style={styles.body}>The admin console must be loaded over HTTPS in a release build. Refusing to load {ADMIN_URL}.</Text>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <StatusBar style="dark" />
        {failed ? (
          <View style={styles.setup}>
            <View style={styles.error}>
              <Text style={styles.errorTitle}>Could not reach the admin console</Text>
              <Text style={styles.body}>Check the network connection and that {ADMIN_URL} is available. Your session is not cached on this device.</Text>
            </View>
            <Pressable style={styles.retry} onPress={() => { setFailed(false); setLoading(true); webRef.current?.reload(); }}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.fill}>
            <WebView
              ref={webRef}
              source={{ uri: ADMIN_URL }}
              style={styles.fill}
              originWhitelist={['https://*']}
              javaScriptEnabled
              domStorageEnabled
              sharedCookiesEnabled={false}
              thirdPartyCookiesEnabled={false}
              setSupportMultipleWindows={false}
              allowsBackForwardNavigationGestures
              onLoadStart={() => setLoading(true)}
              onLoadEnd={() => { setLoading(false); webRef.current?.injectJavaScript(AUTH_SYNC_SCRIPT); }}
              onMessage={onWebMessage}
              onError={() => { setFailed(true); setLoading(false); }}
              onHttpError={(event) => { if (event.nativeEvent.statusCode >= 500) { setFailed(true); setLoading(false); } }}
              onNavigationStateChange={onNavigation}
              startInLoadingState={false}
            />
            {loading && <View style={styles.loading} pointerEvents="none"><ActivityIndicator color="#421080" /><Text style={styles.loadingText}>Loading the admin console…</Text></View>}
            {canGoBack && <Pressable style={styles.back} onPress={() => webRef.current?.goBack()} accessibilityLabel="Go back"><Text style={styles.backText}>‹ Back</Text></Pressable>}
          </View>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
