import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { forgotSchema } from '@gowayy/validation';
import { client } from '../../src/lib/client';
import { Button, DemoBanner, Field, Screen, TextInput } from '../../src/components/UI';
import { OtpBoxes } from '../../src/components/OtpBoxes';
import { assessPassword } from '@gowayy/validation';
import { useTheme, font, spacing } from '../../src/theme';
import type { z } from 'zod';

type Form = z.infer<typeof forgotSchema>;

export default function ForgotScreen() {
  const router = useRouter();
  const { c } = useTheme();
  const [phase, setPhase] = useState<'email' | 'reset'>('email');
  const [resetId, setResetId] = useState('');
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [demoNotice, setDemoNotice] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const { control, handleSubmit, formState: { errors } } = useForm<Form>({ resolver: zodResolver(forgotSchema), defaultValues: { email: '' } });

  const request = handleSubmit(async (d) => {
    setBusy(true); setError(null);
    try {
      const r = await client.forgotPassword(d.email);
      setResetId(r.resetId); setDemoCode(r.demoCode ?? null); setDemoNotice(r.demoNotice);
      setPhase('reset');
    } catch (e) { setError(e instanceof Error ? e.message : 'Request failed.'); }
    finally { setBusy(false); }
  });

  async function reset() {
    if (code.length !== 6) { setError('Enter all six digits.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    if (!assessPassword(password).valid) { setError(assessPassword(password).suggestion); return; }
    setBusy(true); setError(null);
    try { await client.resetPassword(resetId, code, password); setDone(true); }
    catch (e) { setError(e instanceof Error ? e.message : 'Reset failed.'); }
    finally { setBusy(false); }
  }

  return (
    <Screen>
      <Pressable onPress={() => router.back()} hitSlop={8}><Text style={{ color: c.textMuted }}>← Back to sign in</Text></Pressable>
      <Text style={[styles.title, { color: c.text }]}>{done ? 'Password updated' : phase === 'email' ? 'Reset your password' : 'Check the code'}</Text>
      {done ? <>
        <Text style={[styles.subtitle, { color: c.textMuted }]}>Sign in with your new password.</Text>
        <Button title="Sign in" onPress={() => router.replace('/auth/login')} />
      </> : phase === 'email' ? <>
        <Text style={[styles.subtitle, { color: c.textMuted }]}>We will send a six-digit reset code to your email.</Text>
        <Controller control={control} name="email" render={({ field }) => (
          <Field label="Email address" error={errors.email?.message}>
            <TextInput value={field.value} onChangeText={field.onChange} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" />
          </Field>
        )} />
        {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
        <Button title="Send reset code" onPress={() => void request()} loading={busy} />
        <View style={styles.footer}><Text style={{ color: c.textMuted }}>Remembered it?</Text><Link href="/auth/login" style={{ color: c.accent }}> Sign in</Link></View>
      </> : <>
        <DemoBanner>{demoNotice}</DemoBanner>
        {demoCode ? <Text style={{ color: c.accent }}>Demo code: {demoCode}</Text> : null}
        <Text style={{ color: c.textMuted, fontSize: font.sizes.xs }}>Reset request: {resetId}</Text>
        <Field label="Six-digit code"><OtpBoxes value={code} onChange={setCode} /></Field>
        <Field label="New password" hint={assessPassword(password).suggestion}>
          <TextInput value={password} onChangeText={setPassword} placeholder="At least 10 characters" secureTextEntry autoCapitalize="none" />
        </Field>
        <Field label="Confirm new password">
          <TextInput value={confirm} onChangeText={setConfirm} placeholder="Repeat password" secureTextEntry autoCapitalize="none" />
        </Field>
        {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
        <Button title="Set new password" onPress={() => void reset()} loading={busy} />
      </>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: font.sizes['2xl'], fontWeight: '800', marginTop: spacing.lg },
  subtitle: { fontSize: font.sizes.sm, lineHeight: 20, marginBottom: spacing.md },
  error: { color: '#B45B4C', fontSize: font.sizes.sm },
  footer: { flexDirection: 'row', marginTop: spacing.lg },
});
