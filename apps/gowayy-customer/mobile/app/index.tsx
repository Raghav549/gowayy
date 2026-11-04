/** Startup gate. Splash → onboarding → authentication → customer tabs. */
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useUI } from '../src/store/useUI';
import { useSession } from '../src/store/useSession';
import { useTheme } from '../src/theme';

export default function Gate() {
  const onboarded = useUI((s) => s.onboarded);
  const user = useSession((s) => s.user);
  const loading = useSession((s) => s.loading);
  const { c } = useTheme();
  if (loading) return <View style={[styles.root, { backgroundColor: c.bg }]}><ActivityIndicator color={c.accent} /></View>;
  return <Redirect href={onboarded ? (user ? '/home' : '/auth/login') : '/onboarding'} />;
}
const styles = StyleSheet.create({ root: { flex: 1, alignItems: 'center', justifyContent: 'center' } });
