import { useState } from 'react';
import { Alert, View } from 'react-native';
import { useRouter } from 'expo-router';
import { client, tokenStore } from '../../src/lib/client';
import { useSession } from '../../src/store';
import { Button, H1, Input, Screen, Body } from '../../src/components/UI';
import { spacing } from '../../src/theme';

/** Shared-identity sign in: same account as GOWAYY customer. */
export default function Login() {
  const router = useRouter();
  const setSession = useSession((s) => s.setSession);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await client.login(email, password);
      await tokenStore.set(res.session.token);
      setSession(res.user as never, res.session.token);
      router.replace('/(tabs)/discover');
    } catch (e) { Alert.alert('Sign in failed', (e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Screen>
      <View style={{ gap: spacing.md, marginTop: spacing.xl }}>
        <H1>Sign in to GOWAYY EXPLORE</H1>
        <Body muted>One account across GOWAYY, PARTNER and EXPLORE — no duplicate sign-ups.</Body>
        <Input label="Email" value={email} onChangeText={setEmail} placeholder="you@example.in" />
        <Input label="Password" value={password} onChangeText={setPassword} secure placeholder="••••••••" />
        <Button label={busy ? 'Signing in…' : 'Sign in'} onPress={() => void submit()} disabled={busy || !email || !password} />
        <Body muted>Exploring works without an account; signing in unlocks saved places and journey sync.</Body>
      </View>
    </Screen>
  );
}
