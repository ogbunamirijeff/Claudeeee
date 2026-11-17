import type { RequestOtpResponse, VerifyOtpResponse } from '@jiko/shared';
import { formatNgPhone, normalizeNgPhone } from '@jiko/shared/phone';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, publicPost } from '../lib/api';
import { useAuth } from '../lib/auth';
import { colors } from '../lib/theme';

export default function Login() {
  const { signIn } = useAuth();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phoneInput, setPhoneInput] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const fail = (e: unknown) => setError(e instanceof ApiError ? e.message : 'Something went wrong. Try again.');

  async function sendCode() {
    setError(null);
    const n = normalizeNgPhone(phoneInput);
    if (!n) return setError('Enter a valid Nigerian mobile number, e.g. 0803 123 4567');
    if (!accepted) return setError('Please accept the Terms and Privacy Policy to continue');
    setBusy(true);
    try {
      const r = await publicPost<RequestOtpResponse>('/v1/auth/otp/request', { phone: n });
      setPhone(n);
      setStep('code');
      setResendIn(r.resendAfterSeconds);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setError(null);
    setBusy(true);
    try {
      const r = await publicPost<VerifyOtpResponse>('/v1/auth/otp/verify', {
        phone,
        code,
        acceptTerms: accepted,
        deviceInfo: `${Platform.OS} ${Platform.Version}`,
      });
      await signIn(r);
      router.replace('/home');
    } catch (e) {
      fail(e);
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.wrap}>
        <Text style={s.logo}>Jiko</Text>
        {step === 'phone' ? (
          <>
            <Text style={s.h1}>Sign in or create an account</Text>
            <Text style={s.sub}>We&apos;ll text you a 6-digit code.</Text>
            <TextInput
              style={s.input}
              keyboardType="phone-pad"
              autoComplete="tel"
              placeholder="0803 123 4567"
              placeholderTextColor={colors.muted}
              value={phoneInput}
              onChangeText={setPhoneInput}
            />
            <View style={s.consent}>
              <Switch value={accepted} onValueChange={setAccepted} />
              <Text style={s.consentText}>
                I agree to Jiko&apos;s Terms and Privacy Policy, including how my data is used to match me with artisans.
              </Text>
            </View>
            {error && <Text style={s.error}>{error}</Text>}
            <Button label={busy ? 'Sending…' : 'Send code'} disabled={busy} onPress={sendCode} />
          </>
        ) : (
          <>
            <Text style={s.h1}>Enter your code</Text>
            <Text style={s.sub}>Sent to {formatNgPhone(phone)}.</Text>
            <TextInput
              style={[s.input, s.code]}
              keyboardType="number-pad"
              autoComplete="sms-otp"
              textContentType="oneTimeCode"
              maxLength={6}
              autoFocus
              value={code}
              onChangeText={(v) => setCode(v.replace(/\D/g, ''))}
            />
            {error && <Text style={s.error}>{error}</Text>}
            <Button label={busy ? 'Checking…' : 'Continue'} disabled={busy || code.length !== 6} onPress={verify} />
            <View style={s.row}>
              <Pressable onPress={() => { setStep('phone'); setCode(''); setError(null); }}>
                <Text style={s.link}>Change number</Text>
              </Pressable>
              <Pressable disabled={resendIn > 0 || busy} onPress={sendCode}>
                <Text style={[s.link, resendIn > 0 && { opacity: 0.5 }]}>{resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}</Text>
              </Pressable>
            </View>
          </>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Button({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} style={[s.btn, disabled && { opacity: 0.5 }]}>
      <Text style={s.btnText}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 14 },
  logo: { fontSize: 24, fontWeight: '600', color: colors.ink, marginBottom: 16 },
  h1: { fontSize: 24, fontWeight: '600', color: colors.ink },
  sub: { color: colors.muted, fontSize: 15 },
  input: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12, fontSize: 18, color: colors.ink },
  code: { textAlign: 'center', letterSpacing: 8 },
  consent: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  consentText: { flex: 1, color: colors.muted, fontSize: 13 },
  error: { color: colors.danger, fontSize: 14 },
  btn: { backgroundColor: colors.brand, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  btnText: { color: colors.brandFg, fontSize: 16, fontWeight: '600' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  link: { color: colors.muted, fontSize: 14 },
});
