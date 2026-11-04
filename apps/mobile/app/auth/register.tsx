/** Four-step registration: names → email/password → OTP → welcome. */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { assessPassword, stepOneSchema, stepTwoSchema, otpSchema } from '@gowayy/validation';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { client } from '../../src/lib/client';
import { useSession } from '../../src/store/useSession';
import { useUI } from '../../src/store/useUI';
import { Button, DemoBanner, Field, GSymbol, Screen, TextInput } from '../../src/components/UI';
import { OtpBoxes } from '../../src/components/OtpBoxes';
import { useTheme, spacing, font } from '../../src/theme';
import type { z } from 'zod';
import type { RegisterResult } from '@gowayy/api-client';

type One = z.infer<typeof stepOneSchema>;
type Two = z.infer<typeof stepTwoSchema>;

export default function RegisterScreen() {
  const router = useRouter();
  const { c } = useTheme();
  const setAuth = useSession((s) => s.setAuth);
  const reduced = useUI((s) => s.reducedMotion);
  const [step, setStep] = useState(1);
  const [names, setNames] = useState<One>({ firstName: '', lastName: '' });
  const [credentials, setCredentials] = useState<Two>({ email: '', password: '', confirmPassword: '' });
  const [registration, setRegistration] = useState<RegisterResult | null>(null);
  const [code, setCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [expired, setExpired] = useState(false);
  const strength = assessPassword(credentials.password, { ...names, email: credentials.email });
  const welcomeScale = useSharedValue(reduced ? 1 : 0.5);
  const welcomeStyle = useAnimatedStyle(() => ({ transform: [{ scale: welcomeScale.value }], opacity: withTiming(1, { duration: 400 }) }));

  const one = useForm<One>({ resolver: zodResolver(stepOneSchema), defaultValues: { firstName: '', lastName: '' } });
  const two = useForm<Two>({ resolver: zodResolver(stepTwoSchema), defaultValues: { email: '', password: '', confirmPassword: '' } });

  useEffect(() => {
    if (!registration) return;
    const tick = () => {
      setResendIn((v) => Math.max(0, v - 1));
      if (new Date(registration.expiresAt).getTime() < Date.now()) setExpired(true);
    };
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [registration]);

  useEffect(() => {
    if (step !== 4) return;
    welcomeScale.value = withSpring(1, { damping: 14 });
    const t = setTimeout(() => router.replace('/home'), 2200);
    return () => clearTimeout(t);
  }, [step, welcomeScale, router]);

  const submitOne = one.handleSubmit((d) => { setNames(d); setStep(2); });
  const submitTwo = two.handleSubmit(async (d) => {
    setBusy(true); setError(null);
    try {
      setCredentials(d);
      const r = await client.register({ firstName: names.firstName, lastName: names.lastName, ...d });
      setRegistration(r);
      setResendIn(r.resendAfterSeconds);
      setExpired(false);
      setStep(3);
    } catch (e) { setError(e instanceof Error ? e.message : 'Registration failed.'); }
    finally { setBusy(false); }
  });

  async function verify(value = code) {
    if (!registration) return;
    if (!otpSchema.safeParse(value).success) { setError('Enter all six digits.'); return; }
    if (expired) { setError('This code expired. Request a new one.'); return; }
    setBusy(true); setError(null);
    try {
      const r = await client.verifyOtp(registration.registrationId, value, credentials.password);
      if (!r.verified) { setError(r.message); return; }
      setAuth(r.user, r.session.token);
      setStep(4);
    } catch (e) { setError(e instanceof Error ? e.message : 'Verification failed.'); }
    finally { setBusy(false); }
  }

  async function resend() {
    if (!registration || resendIn > 0) return;
    setBusy(true); setError(null);
    try {
      const r = await client.resendOtp(registration.registrationId);
      setRegistration(r); setResendIn(r.resendAfterSeconds); setExpired(false); setCode('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not resend.'); }
    finally { setBusy(false); }
  }

  return (
    <Screen>
      {step < 4 ? (
        <View style={styles.progress}>
          {[1, 2, 3].map((i) => <View key={i} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: i <= step ? c.accent : c.border }} />)}
        </View>
      ) : null}

      {step === 1 ? <>
        <Text style={[styles.title, { color: c.text }]}>Let's start with your name</Text>
        <Text style={[styles.subtitle, { color: c.textMuted }]}>Step 1 of 3 · We use this on bookings and invoices.</Text>
        <Controller control={one.control} name="firstName" render={({ field }) => (
          <Field label="First name" error={one.formState.errors.firstName?.message}>
            <TextInput value={field.value} onChangeText={field.onChange} placeholder="Aarav" testID="first-name" />
          </Field>
        )} />
        <Controller control={one.control} name="lastName" render={({ field }) => (
          <Field label="Last name" error={one.formState.errors.lastName?.message}>
            <TextInput value={field.value} onChangeText={field.onChange} placeholder="Sharma" testID="last-name" />
          </Field>
        )} />
        <Button title="Next" onPress={() => void submitOne()} testID="step-one-next" />
      </> : null}

      {step === 2 ? <>
        <Pressable onPress={() => setStep(1)} hitSlop={8}><Text style={{ color: c.textMuted }}>← Back</Text></Pressable>
        <Text style={[styles.title, { color: c.text }]}>Create your sign-in</Text>
        <Text style={[styles.subtitle, { color: c.textMuted }]}>Step 2 of 3 · Your password stays on the server, never in the app.</Text>
        <Controller control={two.control} name="email" render={({ field }) => (
          <Field label="Email address" error={two.formState.errors.email?.message}>
            <TextInput value={field.value} onChangeText={field.onChange} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" testID="register-email" />
          </Field>
        )} />
        <Controller control={two.control} name="password" render={({ field }) => (
          <Field label="Password" error={two.formState.errors.password?.message}
            hint={credentials.password ? '' : strength.suggestion}>
            <TextInput value={field.value} onChangeText={(v) => { field.onChange(v); setCredentials((p) => ({ ...p, password: v })); }} placeholder="At least 10 characters" secureTextEntry={!showPassword} autoCapitalize="none" testID="register-password" />
          </Field>
        )} />
        {credentials.password ? <View style={styles.strength}>
          <View style={[styles.bar, { backgroundColor: c.border }]}>
            <View style={{ width: `${(strength.score / 4) * 100}%`, height: '100%', backgroundColor: strength.valid ? c.accent : c.textMuted }} />
          </View>
          <Text style={{ color: c.textMuted, fontSize: font.sizes.xs }}>{strength.label} · {strength.suggestion}</Text>
        </View> : null}
        <Controller control={two.control} name="confirmPassword" render={({ field }) => (
          <Field label="Confirm password" error={two.formState.errors.confirmPassword?.message}>
            <TextInput value={field.value} onChangeText={field.onChange} placeholder="Repeat password" secureTextEntry={!showPassword} autoCapitalize="none" testID="register-confirm" />
          </Field>
        )} />
        <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8}><Text style={{ color: c.accent, fontSize: font.sizes.sm }}>{showPassword ? 'Hide password' : 'Show password'}</Text></Pressable>
        {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
        <Button title="Send verification code" onPress={() => void submitTwo()} loading={busy} testID="step-two-next" />
      </> : null}

      {step === 3 && registration ? <>
        <Pressable onPress={() => setStep(2)} hitSlop={8}><Text style={{ color: c.textMuted }}>← Back</Text></Pressable>
        <Text style={[styles.title, { color: c.text }]}>Enter the 6-digit code</Text>
        <Text style={[styles.subtitle, { color: c.textMuted }]}>Step 3 of 3 · Sent to {credentials.email}</Text>
        <DemoBanner>{registration.demoNotice}</DemoBanner>
        {registration.demoMode && registration.demoOtp ? <Text style={{ color: c.accent }}>Demo code: {registration.demoOtp}</Text> : null}
        <OtpBoxes value={code} onChange={(v) => { setCode(v); if (v.length === 6) void verify(v); }} disabled={busy || expired} />
        <Text style={{ color: c.textMuted, fontSize: font.sizes.xs }}>Expires at {new Date(registration.expiresAt).toLocaleTimeString()}{expired ? ' · expired' : ''}</Text>
        {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
        <Button title="Verify & create account" onPress={() => void verify()} loading={busy} disabled={expired} />
        <Pressable onPress={() => void resend()} disabled={resendIn > 0 || busy} hitSlop={8}>
          <Text style={{ color: resendIn > 0 ? c.textMuted : c.accent, fontSize: font.sizes.sm }}>
            {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
          </Text>
        </Pressable>
      </> : null}

      {step === 4 ? <Animated.View style={[styles.welcome, welcomeStyle]}>
        <GSymbol size={110} />
        <Text style={[styles.title, { color: c.text, textAlign: 'center' }]}>Welcome to GOWAYY</Text>
        <Text style={[styles.subtitle, { color: c.textMuted, textAlign: 'center' }]}>Your account is ready. One journey, every service.</Text>
        <Button title="Open home" onPress={() => router.replace('/home')} />
      </Animated.View> : null}

      {step < 3 ? <View style={styles.footer}>
        <Text style={{ color: c.textMuted }}>Already registered?</Text>
        <Link href="/auth/login" style={{ color: c.accent, fontWeight: '600' }}> Sign in</Link>
      </View> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  progress: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.lg },
  title: { fontSize: font.sizes['2xl'], fontWeight: '800', marginBottom: spacing.xs },
  subtitle: { fontSize: font.sizes.sm, lineHeight: 20, marginBottom: spacing.md },
  strength: { gap: spacing.xs },
  bar: { height: 5, borderRadius: 3, overflow: 'hidden' },
  error: { color: '#B45B4C', fontSize: font.sizes.sm },
  footer: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.lg },
  welcome: { alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingTop: spacing.hero * 2 },
});
