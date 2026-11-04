/** Cinematic 3D-informed splash: layered 2.5D G surfaces with real motion. */
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, useWindowDimensions, View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useUI } from '../src/store/useUI';
import { useTheme, spacing, font } from '../src/theme';

const SPLASH_MS = 2300;

export default function SplashScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { c } = useTheme();
  const reducedMotion = useUI((s) => s.reducedMotion);
  const setSplashSeen = useUI((s) => s.setSplashSeen);
  const size = Math.min(width * 0.62, 260);
  const progress = useRef(new Animated.Value(0)).current;
  const navigate = useRef<() => void>(() => {});
  navigate.current = () => { setSplashSeen(true); router.replace('/onboarding'); };

  useEffect(() => {
    if (reducedMotion) {
      progress.setValue(1);
      const t = setTimeout(() => navigate.current(), 900);
      return () => clearTimeout(t);
    }
    Animated.timing(progress, {
      toValue: 1, duration: SPLASH_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true,
    }).start();
    const t = setTimeout(() => navigate.current(), SPLASH_MS + 250);
    return () => clearTimeout(t);
  }, [progress, reducedMotion]);

  const backScale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1.12] });
  const midScale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.62, 1] });
  const frontScale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.86] });
  const opacity = progress.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 1, 1] });
  const drift = progress.interpolate({ inputRange: [0, 1], outputRange: [34, 0] });
  const spin = progress.interpolate({ inputRange: [0, 1], outputRange: ['-16deg', '0deg'] });
  const lineWidth = progress.interpolate({ inputRange: [0, 1], outputRange: [0, width * 0.42] });

  return (
    <Pressable onPress={() => navigate.current()} style={[styles.root, { backgroundColor: c.bg }]} accessibilityLabel="Skip splash">
      <View style={[styles.stage, { width: size * 1.6, height: size * 1.35 }]}>
        <Animated.View style={[styles.layer, { opacity: opacity.interpolate({ inputRange: [0, 1], outputRange: [0, 0.16] }), transform: [{ scale: backScale }, { rotate: '-11deg' }] }]}>
          <Image source={require('../assets/branding/g-symbol.png')} style={{ width: size, height: size }} contentFit="contain" tintColor={c.accent} />
        </Animated.View>
        <Animated.View style={[styles.layer, { opacity: opacity.interpolate({ inputRange: [0, 1], outputRange: [0, 0.38] }), transform: [{ scale: midScale }, { translateX: drift }, { rotate: spin }] }]}>
          <Image source={require('../assets/branding/g-symbol.png')} style={{ width: size, height: size }} contentFit="contain" tintColor={c.accent} />
        </Animated.View>
        <Animated.View style={[styles.layer, { opacity, transform: [{ scale: frontScale }] }]}>
          <Image source={require('../assets/branding/g-symbol.png')} style={{ width: size, height: size }} contentFit="contain" />
        </Animated.View>
      </View>
      <Animated.View style={{ opacity }}>
        <Text style={[styles.wordmark, { color: c.text }]}>GOWAYY</Text>
        <Text style={[styles.tagline, { color: c.textMuted }]}>One journey. Every service.</Text>
      </Animated.View>
      <Animated.View style={[styles.line, { backgroundColor: c.accent, width: lineWidth }]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  stage: { alignItems: 'center', justifyContent: 'center' },
  layer: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  wordmark: { fontSize: font.sizes['3xl'], fontWeight: '800', letterSpacing: 6, textAlign: 'center' },
  tagline: { fontSize: font.sizes.sm, letterSpacing: 1.2, textAlign: 'center', marginTop: spacing.xs },
  line: { height: 2, borderRadius: 1, marginTop: spacing.md },
});
