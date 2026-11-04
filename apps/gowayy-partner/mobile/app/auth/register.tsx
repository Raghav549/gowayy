import { useState } from 'react';
import { Alert, View } from 'react-native';
import { useRouter } from 'expo-router';
import { client, tokenStore } from '../../src/lib/client';
import { useSession } from '../../src/store';
import { Button, H1, Input, Screen, Body } from '../../src/components/UI';
import { spacing } from '../../src/theme';

/** Registration step 1–2 + OTP step. Demo OTP is labelled as a dev adapter. */
export default function Register() {
  const router = useRouter();
  const setSession = useSession((s) => s.setSession);
  const [step, setStep] = useState(0);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [regId, setRegId] = useState('');
  const [demoOtp, setDemoOtp] = useState<string | null>(null);
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);

  const sendOtp = async () => {
    setBusy(true);
    try {
      const res = await client.register({ firstName, lastName, email, password, confirmPassword: password });
      setRegId(res.registrationId);
      setDemoOtp((res as { demoOtp?: string }).demoOtp ?? null);
      setStep(1);
    } catch (e) { Alert.alert('Registration failed', (e as Error).message); } finally { setBusy(false); }
  };

  const verify = async () => {
    setBusy(true);
    try {
      const res = await client.verifyOtp(regId, otp);
      if (!('session' in res)) throw new Error(res.message ?? 'Verification failed');
      tokenStore.set(res.session.token);
      setSession(res.user as never, res.session.token);
      router.replace('/(tabs)/home');
    } catch (e) { Alert.alert('Invalid code', (e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Screen>
      <View style={{ gap: spacing.md, marginTop: spacing.xl }}>
        <H1>Become a GOWAYY partner</H1>
        {step === 0 ? (
          <>
            <Body muted>One shared identity across GOWAYY, PARTNER and EXPLORE.</Body>
            <Input label="First name" value={firstName} onChangeText={setFirstName} />
            <Input label="Last name" value={lastName} onChangeText={setLastName} />
            <Input label="Email" value={email} onChangeText={setEmail} placeholder="you@business.in" />
            <Input label="Password" value={password} onChangeText={setPassword} secure />
            <Button label={busy ? 'Sending code…' : 'Continue'} onPress={() => void sendOtp()} disabled={busy || !firstName || !lastName || !email || password.length < 8} />
          </>
        ) : (
          <>
            <Body muted>Enter the 6-digit code sent to {email}.{demoOtp ? ` Dev build — demo adapter code: ${demoOtp} (not a real email).` : ''}</Body>
            <Input label="6-digit code" value={otp} onChangeText={setOtp} placeholder="123456" />
            <Button label={busy ? 'Verifying…' : 'Verify & continue'} onPress={() => void verify()} disabled={busy || otp.length !== 6} />
          </>
        )}
      </View>
    </Screen>
  );
}
