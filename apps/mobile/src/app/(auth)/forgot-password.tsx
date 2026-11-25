import { useRouter } from 'expo-router';
import { useState } from 'react';
import { api } from '../../lib/api';
import { Banner, Button, Field, Screen, T } from '../../components/ui';

export default function ForgotPassword() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <T v="title">Reset your password</T>
      {error ? <Banner tone="error" text={error} /> : null}
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      {!sent ? (
        <Button label="Send me a code" loading={busy} disabled={!email} onPress={() => run(async () => { await api('/auth/password-reset/request', { auth: false, body: { email: email.trim() } }); setSent(true); })} />
      ) : (
        <>
          <T v="muted">If an account uses that email, we have sent it a code.</T>
          <Field label="6 digit code" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} />
          <Field label="New password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" />
          <Button label="Set new password" loading={busy} onPress={() => run(async () => { await api('/auth/password-reset/confirm', { auth: false, body: { email: email.trim(), code, newPassword: password } }); router.replace('/sign-in'); })} />
        </>
      )}
    </Screen>
  );
}
