/** Four animated onboarding scenes. Motion is real (Reanimated), not a static graphic. */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, {
  cancelAnimation, Easing, interpolate, useAnimatedStyle, useSharedValue,
  withDelay, withRepeat, withSpring, withTiming, type SharedValue,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useUI } from '../src/store/useUI';
import { GSymbol } from '../src/components/UI';
import { useTheme, spacing, radius, font } from '../src/theme';

const SLIDES = [
  { eyebrow: '01 / DISCOVER', title: 'One journey, every service', body: 'Plan Bagdogra to Darjeeling once. Stays, sights, local taxis, meals and groceries stay connected to that journey.' },
  { eyebrow: '02 / MOVE', title: 'Cabs, shared taxis & parcels', body: 'Book a private cab, take a shared seat, or send a parcel. Every trip is priced and confirmed on the server.' },
  { eyebrow: '03 / STAY & EAT', title: 'Stays, food & groceries', body: 'Homestays, lodges, restaurant meals and local stores — each with its own real availability and inventory.' },
  { eyebrow: '04 / EXPLORE', title: 'Hidden gems, honestly shown', body: 'Find quieter places. Where a verified photograph is not available, GOWAYY says so instead of substituting a stock image.' },
];

function useLoop(reduced: boolean): SharedValue<number> {
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduced) { t.value = 0; return; }
    t.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.quad) }), -1, true);
    return () => cancelAnimation(t);
  }, [t, reduced]);
  return t;
}

function Scene({ index, reduced }: { index: number; reduced: boolean }) {
  const t = useLoop(reduced);
  const { c } = useTheme();
  const stage = useAnimatedStyle(() => ({ opacity: withTiming(1, { duration: 380 }) }));
  const orbit = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(t.value, [0, 1], [0, 60])}deg` }, { scale: interpolate(t.value, [0, 1], [0.9, 1.06]) }],
  }));
  const travel = useAnimatedStyle(() => ({ transform: [{ translateX: interpolate(t.value, [0, 1], [-70, 70]) }] }));
  const rise = (delay: number) => useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(t.value, [0, 1], [delay * 3, -delay * 3]) }, { scale: interpolate(t.value, [0, 1], [0.94, 1]) }],
  }));
  const r1 = rise(6); const r2 = rise(12); const r3 = rise(18);
  const pulse = useAnimatedStyle(() => ({ transform: [{ scale: interpolate(t.value, [0, 1], [0.75, 1.25]) }], opacity: interpolate(t.value, [0, 1], [0.35, 1]) }));

  const ring = (size: number, inset: number): ReactNode => (
    <View style={{ position: 'absolute', width: size, height: size, borderRadius: size / 2, borderWidth: 1.5, borderColor: c.accent, opacity: 0.35 }} />
  );

  if (index === 0) return (
    <Animated.View style={[styles.stage, stage]}>
      <Animated.View style={[styles.center, orbit]}>{ring(210, 0)}<View style={{ position: 'absolute', width: 150, height: 150, borderRadius: 75, borderWidth: 1.5, borderColor: c.border }} /></Animated.View>
      <Animated.View style={[styles.center, { transform: [{ rotate: '-18deg' }] }]}><GSymbol size={96} /></Animated.View>
      <Animated.View style={[styles.dot, { left: '18%', top: '24%', backgroundColor: c.accent }, pulse]} />
      <Animated.View style={[styles.dot, { right: '16%', bottom: '22%', backgroundColor: c.textMuted }, pulse]} />
    </Animated.View>
  );
  if (index === 1) return (
    <Animated.View style={[styles.stage, stage]}>
      <View style={[styles.road, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
        <Animated.View style={[{ flexDirection: 'row', gap: 26 }, travel]}>
          {[0, 1, 2, 3, 4].map((i) => <View key={i} style={{ width: 36, height: 3, backgroundColor: c.accent, borderRadius: 2 }} />)}
        </Animated.View>
      </View>
      <Animated.View style={[styles.vehicle, { backgroundColor: c.raised, borderColor: c.accent }, travel]}>
        <View style={[styles.window, { backgroundColor: c.surfaceAlt }]} />
        <Text style={{ color: c.text, fontSize: font.sizes.xs }}>GOWAYY</Text>
      </Animated.View>
      <Animated.View style={[styles.dot, { left: '22%', top: '12%', backgroundColor: c.accent }, pulse]} />
    </Animated.View>
  );
  if (index === 2) return (
    <Animated.View style={[styles.stage, stage]}>
      {[r1, r2, r3].map((style, i) => (
        <Animated.View key={i} style={[styles.tile, { backgroundColor: c.surfaceAlt, borderColor: c.border, left: `${12 + i * 9}%`, top: `${16 + i * 22}%` }, style]}>
          <View style={{ width: 30, height: 30, borderRadius: radius.xs, backgroundColor: c.accent, opacity: 0.35, marginBottom: 6 }} />
          <View style={{ width: 90, height: 5, borderRadius: 3, backgroundColor: c.border, marginBottom: 4 }} />
          <View style={{ width: 60, height: 5, borderRadius: 3, backgroundColor: c.border }} />
        </Animated.View>
      ))}
    </Animated.View>
  );
  return (
    <Animated.View style={[styles.stage, stage]}>
      <Animated.View style={[styles.center, orbit]}>
        <View style={{ width: 170, height: 170, borderRadius: 85, borderWidth: 1.5, borderColor: c.border }} />
      </Animated.View>
      {[{ left: '20%', top: '20%' }, { right: '18%', top: '34%' }, { left: '34%', bottom: '20%' }, { right: '28%', bottom: '16%' }].map((pos, i) => (
        <Animated.View key={i} style={[styles.dot, pos, { backgroundColor: i % 2 ? c.accent : c.textMuted }, pulse]} />
      ))}
      <View style={styles.center}><GSymbol size={54} /></View>
    </Animated.View>
  );
}

export default function Onboarding() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { c } = useTheme();
  const reduced = useUI((s) => s.reducedMotion);
  const setOnboarded = useUI((s) => s.setOnboarded);
  const [index, setIndex] = useState(0);
  const slide = SLIDES[index];
  const finish = useCallback(() => { setOnboarded(true); router.replace('/auth/login'); }, [setOnboarded, router]);
  const next = useCallback(() => { if (index === SLIDES.length - 1) finish(); else setIndex(index + 1); }, [index, finish]);
  const previous = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const gesture = Gesture.Pan()
    .activeOffsetX([-24, 24])
    .onEnd((e) => { if (e.translationX < -50) next(); else if (e.translationX > 50) previous(); })
    .runOnJS(true);
  const textProgress = useSharedValue(1);

  useEffect(() => {
    if (reduced) { textProgress.value = 1; return; }
    textProgress.value = 0;
    const anim = withSpring(1, { damping: 18 });
    textProgress.value = anim;
  }, [index, reduced, textProgress]);

  return (
    <GestureDetector gesture={gesture}>
      <View style={[styles.root, { backgroundColor: c.bg }]}>
        <View style={styles.top}>
          {reduced ? <Text style={[styles.eyebrowSmall, { color: c.textMuted }]}>REDUCED MOTION</Text> : null}
          <Pressable onPress={finish} accessibilityRole="button" hitSlop={12}>
            <Text style={[styles.skip, { color: c.textMuted }]}>Skip</Text>
          </Pressable>
        </View>
        <View style={[styles.art, { width: Math.min(width - spacing.xl * 2, 420) }]}>
          <Scene key={index} index={index} reduced={reduced} />
        </View>
        <View style={styles.copy}>
          <Text style={[styles.eyebrow, { color: c.accent }]}>{slide.eyebrow}</Text>
          <Text style={[styles.title, { color: c.text }]}>{slide.title}</Text>
          <Text style={[styles.body, { color: c.textMuted }]}>{slide.body}</Text>
        </View>
        <View style={styles.dots} accessibilityRole="tablist">
          {SLIDES.map((s, i) => (
            <Pressable key={s.title} onPress={() => setIndex(i)} accessibilityRole="tab" accessibilityState={{ selected: i === index }} hitSlop={10}>
              <View style={[styles.indicator, { backgroundColor: i === index ? c.accent : c.border, width: i === index ? 24 : 8 }]} />
            </Pressable>
          ))}
        </View>
        <View style={styles.controls}>
          <Pressable onPress={previous} disabled={index === 0} accessibilityRole="button" accessibilityLabel="Previous slide" style={[styles.control, { borderColor: c.border, opacity: index === 0 ? 0.4 : 1 }]}>
            <Text style={{ color: c.text }}>Back</Text>
          </Pressable>
          <Pressable onPress={next} accessibilityRole="button" accessibilityLabel="Next slide" style={[styles.control, { backgroundColor: c.accent, borderColor: c.accent }]}>
            <Text style={{ color: c.accentContrast, fontWeight: '600' }}>{index === SLIDES.length - 1 ? 'Start' : 'Next'}</Text>
          </Pressable>
        </View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: spacing.xl, justifyContent: 'space-between' },
  top: { alignItems: 'flex-end', gap: spacing.xs },
  eyebrowSmall: { fontSize: 10, letterSpacing: 1.5 },
  skip: { fontSize: font.sizes.sm, paddingVertical: spacing.xs },
  art: { height: 260, alignSelf: 'center' },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center', position: 'absolute' },
  dot: { position: 'absolute', width: 14, height: 14, borderRadius: 7 },
  road: { width: '100%', height: 90, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  vehicle: { position: 'absolute', bottom: 56, width: 116, height: 58, borderRadius: radius.sm, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  window: { width: 56, height: 12, borderRadius: 3 },
  tile: { position: 'absolute', width: 132, height: 84, borderRadius: radius.sm, borderWidth: 1, padding: spacing.sm },
  copy: { gap: spacing.sm, minHeight: 150 },
  eyebrow: { fontSize: font.sizes.xs, letterSpacing: 2, fontWeight: '700' },
  title: { fontSize: font.sizes['2xl'], fontWeight: '800', letterSpacing: -0.5 },
  body: { fontSize: font.sizes.base, lineHeight: 23 },
  dots: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  indicator: { height: 8, borderRadius: 4 },
  controls: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  control: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, borderWidth: 1 },
});
