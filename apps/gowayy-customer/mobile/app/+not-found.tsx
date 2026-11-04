import { Link, Stack } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing } from '../src/theme';

export default function NotFound() {
  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: 'Not found' }} />
      <Text style={styles.title}>This page does not exist.</Text>
      <Link href="/" style={styles.link}>Return home</Link>
    </View>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  title: { color: colors.text, fontSize: 18, marginBottom: spacing.md },
  link: { color: colors.accent, fontSize: 16 },
});
