/** Six-box OTP entry with auto-focus, backspace navigation and paste support. */
import { useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useTheme, radius, font } from '../theme';

interface Focusable { focus: () => void }

export function OtpBoxes({ value, onChange, disabled = false }: {
  value: string; onChange: (next: string) => void; disabled?: boolean;
}) {
  const { c } = useTheme();
  const refs = useRef<Array<Focusable | null>>([]);
  const [focused, setFocused] = useState<number | null>(null);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? '');

  function setDigit(i: number, text: string) {
    const clean = text.replace(/\D/g, '');
    if (clean.length > 1) {
      // Paste: fill from the current box onward.
      const next = (value.slice(0, i) + clean).slice(0, 6);
      onChange(next);
      refs.current[Math.min(next.length, 5)]?.focus();
      return;
    }
    const chars = value.padEnd(6, ' ').split('');
    chars[i] = clean || ' ';
    onChange(chars.join('').replace(/ /g, ''));
    if (clean && i < 5) refs.current[i + 1]?.focus();
  }

  function backspace(i: number) {
    if (value.length <= i) {
      onChange(value.slice(0, Math.max(0, i - 1)));
      if (i > 0) refs.current[i - 1]?.focus();
    }
  }

  return (
    <View style={styles.row}>
      {digits.map((d, i) => (
        <TextInput
          key={i}
          ref={(el) => { refs.current[i] = el as unknown as Focusable | null; }}
          value={d}
          onChangeText={(t) => setDigit(i, t)}
          onKeyPress={({ nativeEvent }) => { if (nativeEvent.key === 'Backspace') backspace(i); }}
          onFocus={() => setFocused(i)}
          onBlur={() => setFocused((f) => (f === i ? null : f))}
          editable={!disabled}
          keyboardType="number-pad"
          maxLength={6}
          autoComplete="sms-otp"
          textAlign="center"
          accessibilityLabel={`OTP digit ${i + 1}`}
          style={[styles.box, {
            backgroundColor: c.surfaceAlt,
            borderColor: focused === i ? c.accent : c.border,
            color: c.text,
          }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
  box: { flex: 1, minWidth: 40, height: 54, borderWidth: 1, borderRadius: radius.sm, fontSize: font.sizes.xl, fontWeight: '700' },
});
