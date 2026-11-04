import { useState } from 'react';
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

  return (
    <Screen>
      <View style={styles.brand}><GSymbol size={62} /><Text style={[styles.wordmark, { color: c.text }]}>GOWAYY</Text></View>
      <Text style={[styles.title, { color: c.text }]}>Welcome back</Text>
      <Text style={[styles.subtitle, { color: c.textMuted }]}>Sign in to continue your journeys, bookings and orders.</Text>

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

      {formError ? <Text style={styles.error} accessibilityRole="alert">{formError}</Text> : null}
      <Button title="Sign in" onPress={() => void submit()} loading={submitting} testID="login-submit" />
      <View style={styles.footer}>
        <Text style={{ color: c.textMuted }}>New to GOWAYY?</Text>
        <Link href="/auth/register" style={{ color: c.accent, fontWeight: '600' }}> Create an account</Link>
      </View>
      <Pressable onPress={() => { showToast('Demo data is loaded from the local API. Configure EXPO_PUBLIC_GOWAYY_API_BASE_URL to connect.'); }} hitSlop={8}>
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
  note: { fontSize: font.sizes.xs, textAlign: 'center', marginTop: spacing.lg },
});
