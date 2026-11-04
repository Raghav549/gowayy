/** Lightweight, reduced-motion-aware reveal of the official layered GOWAYY mark. */
import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useUI } from '../src/store/useUI';
import { useTheme } from '../src/theme';

const SPLASH_MS = 1450;
export default function SplashScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { c } = useTheme();
  const reducedMotion = useUI((s) => s.reducedMotion);
  const setSplashSeen = useUI((s) => s.setSplashSeen);
  const purple = useRef(new Animated.Value(0)).current;
  const orange = useRef(new Animated.Value(0)).current;
  const wordmark = useRef(new Animated.Value(0)).current;
  const navigate = useRef<() => void>(() => {});
  navigate.current = () => { setSplashSeen(true); router.replace('/onboarding'); };

  useEffect(() => {
    if (reducedMotion) {
      purple.setValue(1); orange.setValue(1); wordmark.setValue(1);
      const timer = setTimeout(() => navigate.current(), 180);
      return () => clearTimeout(timer);
    }
    Animated.timing(purple, { toValue: 1, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    const orangeTimer = setTimeout(() => Animated.timing(orange, { toValue: 1, duration: 580, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(), 260);
    const wordTimer = setTimeout(() => Animated.timing(wordmark, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(), 420);
    const finishTimer = setTimeout(() => navigate.current(), SPLASH_MS);
    return () => { clearTimeout(orangeTimer); clearTimeout(wordTimer); clearTimeout(finishTimer); };
  }, [purple, orange, wordmark, reducedMotion]);

  const markSize = Math.min(width * 0.52, 236);
  const lift = (value: Animated.Value) => value.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });
  return <Pressable onPress={() => navigate.current()} accessibilityRole="button" accessibilityLabel="Skip GOWAYY splash" style={[styles.root, { backgroundColor: c.bg }]}>
    <View pointerEvents="none" style={[styles.wash, { backgroundColor: c.surfaceAlt }]} />
    <View style={{ width: markSize, height: markSize }}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: purple, transform: [{ translateY: lift(purple) }] }]}>
        <Image source={require('../assets/branding/g-purple.png')} style={styles.mark} contentFit="contain" accessibilityLabel="" />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: orange, transform: [{ translateY: lift(orange) }] }]}>
        <Image source={require('../assets/branding/g-orange.png')} style={styles.mark} contentFit="contain" accessibilityLabel="" />
      </Animated.View>
    </View>
    <Animated.Text accessibilityLiveRegion="polite" style={[styles.wordmark, { opacity: wordmark, transform: [{ translateY: lift(wordmark) }] }]}>GOWAYY</Animated.Text>
  </Pressable>;
}
const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  wash: { position: 'absolute', width: 320, height: 320, borderRadius: 160, opacity: 0.3 },
  mark: { width: '100%', height: '100%' },
  wordmark: { color: '#17131B', fontSize: 28, lineHeight: 34, fontWeight: '800', letterSpacing: 2.1 },
});
