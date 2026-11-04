import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { colors, font, radius, spacing } from '../src/theme';

const SCENES = [
  { title: 'Discover the Himalaya', body: 'Darjeeling, Kalimpong, Kurseong, Mirik, Siliguri and verified hidden gems — with honest photos and routes.', art: '🏔️' },
  { title: 'Hidden gems, verified', body: 'Coordinates, access, seasonality and safety notes — only locations that were actually checked.', art: '🗺️' },
  { title: 'Book with GOWAYY', body: 'Every stay, cab, meal or package hands off to the GOWAYY app with your journey context intact.', art: '🎫' },
];

/** Splash → onboarding → discover. Light identity, plum accent. */
export default function Index() {
  const router = useRouter();
  const [phase, setPhase] = useState<'splash' | 'onboarding' | 'done'>('splash');
  const [scene, setScene] = useState(0);

  if (phase === 'splash') {
    return (
      <Pressable style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: spacing.lg }}
        onPress={() => setPhase('onboarding')} accessibilityLabel="Continue">
        <Image source={require('../assets/branding/splash-logo.png')} style={{ width: 180, height: 180 }} contentFit="contain" />
        <Text style={{ fontSize: font.sizes['2xl'], fontWeight: font.display, color: colors.text, letterSpacing: 4 }}>GOWAYY EXPLORE</Text>
        <Text style={{ color: colors.textMuted }}>Tap to explore</Text>
      </Pressable>
    );
  }
  if (phase === 'onboarding') {
    const s = SCENES[scene];
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.xl, justifyContent: 'space-between' }}>
        <View style={{ alignItems: 'center', marginTop: spacing.xxl, gap: spacing.lg }}>
          <View style={{ width: 120, height: 120, borderRadius: radius.pill, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 56 }}>{s.art}</Text>
          </View>
          <Text style={{ fontSize: font.sizes['2xl'], fontWeight: font.display, color: colors.text, textAlign: 'center' }}>{s.title}</Text>
          <Text style={{ color: colors.textMuted, textAlign: 'center' }}>{s.body}</Text>
        </View>
        <View style={{ gap: spacing.md }}>
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.sm }}>
            {SCENES.map((_, i) => <View key={i} style={{ width: i === scene ? 22 : 8, height: 8, borderRadius: radius.pill, backgroundColor: i === scene ? colors.accent : colors.border }} />)}
          </View>
          <Pressable onPress={() => (scene < SCENES.length - 1 ? setScene(scene + 1) : setPhase('done'))}
            style={{ backgroundColor: colors.accent, borderRadius: radius.md, padding: spacing.lg, alignItems: 'center' }}>
            <Text style={{ color: colors.accentContrast, fontWeight: font.semibold }}>{scene < SCENES.length - 1 ? 'Next' : 'Start exploring'}</Text>
          </Pressable>
          <Pressable onPress={() => setPhase('done')} style={{ alignItems: 'center', padding: spacing.sm }}>
            <Text style={{ color: colors.textMuted, fontSize: font.sizes.sm }}>Skip</Text>
          </Pressable>
        </View>
      </View>
    );
  }
  router.replace('/(tabs)/discover');
  return null;
}
