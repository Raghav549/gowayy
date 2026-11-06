import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema } from '@gowayy/validation';
import { client } from '../../src/lib/client';
import { useSession } from '../../src/store/useSession';
import { useUI } from '../../src/store/useUI';
import { Button, Field, GSymbol, Screen, TextInput } from '../../src/components/UI';
import { useTheme, spacing, font } from '../../src/theme';
import type { z } from 'zod';

type Form = z.infer<typeof loginSchema>;

export default function LoginScreen() {
  const router = useRouter();
  const { c } = useTheme();
  const setAuth = useSession((s) => s.setAuth);
  const showToast = useUI((s) => s.showToast);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [authMethod, setAuthMethod] = useState<'email' | 'phone'>('email');
  const [phone, setPhone] = useState('+91');
  const [code, setCode] = useState('');
  const [phonePhase, setPhonePhase] = useState<'request' | 'verify'>('request');
  const [resendIn, setResendIn] = useState(0);
  const { control, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' },
  });

  const submit = handleSubmit(async (data) => {
    setSubmitting(true); setFormError(null);
    try {
      const r = await client.login(data.email, data.password);
      setAuth(r.user, r.session.token);
      router.replace('/home');
    } catch (e) { setFormError(e instanceof Error ? e.message : 'Sign in failed.'); }
    finally { setSubmitting(false); }
  });

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setInterval(() => setResendIn((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendIn]);

  const requestPhone = async () => {
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) { setFormError('Enter an international number such as +919876543210.'); return; }
    setSubmitting(true); setFormError(null);
    try {
      const result = await client.requestPhoneOtp(phone);
      setResendIn(result.resendAfterSeconds); setPhonePhase('verify'); setCode('');
    } catch (e) { setFormError(e instanceof Error ? e.message : 'Could not request an SMS code.'); }
    finally { setSubmitting(false); }
  };
  const verifyPhone = async () => {
    if (!/^\d{6}$/.test(code)) { setFormError('Enter the six-digit SMS code.'); return; }
    setSubmitting(true); setFormError(null);
    try {
      const result = await client.verifyPhoneOtp(phone, code);
      setAuth(result.user, result.session.token);
      router.replace('/home');
    } catch (e) { setFormError(e instanceof Error ? e.message : 'Phone verification failed.'); }
    finally { setSubmitting(false); }
  };

  return (
    <Screen>
      <View style={styles.brand}><GSymbol size={62} /><Text style={[styles.wordmark, { color: c.text }]}>GOWAYY</Text></View>
      <Text style={[styles.title, { color: c.text }]}>Welcome back</Text>
      <Text style={[styles.subtitle, { color: c.textMuted }]}>Sign in to continue your journeys, bookings and orders.</Text>

      {authMethod === 'email' ? <>
        <Controller control={control} name="email" render={({ field }) => (
          <Field label="Email address" error={errors.email?.message}>
            <TextInput value={field.value} onChangeText={field.onChange} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" testID="login-email" />
          </Field>
        )} />
        <Controller control={control} name="password" render={({ field }) => (
          <Field label="Password" error={errors.password?.message}>
            <TextInput value={field.value} onChangeText={field.onChange} placeholder="Your password" secureTextEntry={!showPassword} autoCapitalize="none" testID="login-password" />
          </Field>
        )} />
        <Pressable onPress={() => setShowPassword((v) => !v)} accessibilityRole="button" hitSlop={8}>
          <Text style={[styles.link, { color: c.accent }]}>{showPassword ? 'Hide password' : 'Show password'}</Text>
        </Pressable>
        <Link href="/auth/forgot" style={[styles.link, { color: c.textMuted }]}>Forgot password?</Link>
      </> : <>
        <Field label="Mobile number" error={undefined}>
          <TextInput value={phone} onChangeText={(value) => setPhone(value.replace(/[\s()-]/g, ''))} placeholder="+919876543210" keyboardType="phone-pad" autoCapitalize="none" editable={phonePhase === 'request' && !submitting} testID="login-phone" />
        </Field>
        <Text style={[styles.phoneHint, { color: c.textMuted }]}>Include the country code. SMS delivery requires Supabase Phone Auth and a configured SMS provider.</Text>
        {phonePhase === 'verify' ? <>
          <Field label="Six-digit SMS code" error={undefined}>
            <TextInput value={code} onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))} placeholder="123456" keyboardType="numeric" autoCapitalize="none" testID="login-phone-code" />
          </Field>
          <View style={styles.phoneActions}>
            <Pressable disabled={submitting} onPress={() => { setPhonePhase('request'); setCode(''); setFormError(null); }}><Text style={{ color: c.accent }}>Change number</Text></Pressable>
            <Pressable disabled={submitting || resendIn > 0} onPress={() => void requestPhone()}><Text style={{ color: resendIn > 0 ? c.textMuted : c.accent }}>{resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}</Text></Pressable>
          </View>
        </> : null}
      </>}

      {formError ? <Text style={styles.error} accessibilityRole="alert">{formError}</Text> : null}
      <Button title={authMethod === 'email' ? 'Sign in' : phonePhase === 'request' ? 'Request SMS code' : 'Verify and sign in'}
        onPress={() => void (authMethod === 'email' ? submit() : phonePhase === 'request' ? requestPhone() : verifyPhone())} loading={submitting} testID="login-submit" />
      <Button title={authMethod === 'email' ? 'Use phone OTP instead' : 'Use email and password instead'} variant="secondary"
        onPress={() => { setAuthMethod(authMethod === 'email' ? 'phone' : 'email'); setFormError(null); }} />
      <View style={styles.footer}>
        <Text style={{ color: c.textMuted }}>New to GOWAYY?</Text>
        <Link href="/auth/register" style={{ color: c.accent, fontWeight: '600' }}> Create an account</Link>
      </View>
      <Pressable onPress={() => { showToast('Set EXPO_PUBLIC_GOWAYY_API_BASE_URL for the HTTP API, or EXPO_PUBLIC_GOWAYY_BACKEND=supabase with the public Supabase settings. Phone OTP requires Supabase.'); }} hitSlop={8}>
        <Text style={[styles.note, { color: c.textMuted }]}>Connection help</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: { alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xl },
  wordmark: { fontSize: font.sizes['2xl'], fontWeight: '800', letterSpacing: 5 },
  title: { fontSize: font.sizes['2xl'], fontWeight: '800' },
  subtitle: { fontSize: font.sizes.base, lineHeight: 22, marginBottom: spacing.md },
  link: { fontSize: font.sizes.sm, alignSelf: 'flex-start' },
  error: { color: '#B45B4C', fontSize: font.sizes.sm },
  footer: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm },
  phoneHint: { fontSize: font.sizes.xs, lineHeight: 18, marginBottom: spacing.sm },
  phoneActions: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.sm },
  note: { fontSize: font.sizes.xs, textAlign: 'center', marginTop: spacing.lg },
});
