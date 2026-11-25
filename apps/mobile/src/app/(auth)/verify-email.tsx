import { useRouter } from 'expo-router';
import { useState } from 'react';
import { api } from '../../lib/api';
import { Banner, Button, Field, Screen, T } from '../../components/ui';

export default function VerifyEmail() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  const verify = async () => {
    setBusy(true);
    try {
      await api('/auth/verify-email', { body: { code } });
      router.replace('/');
    } catch (e) {
      setMsg({ tone: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <T v="title">Check your email</T>
      <T v="muted">We sent you a 6 digit code to confirm your email address.</T>
      {msg ? <Banner tone={msg.tone} text={msg.text} /> : null}
      <Field label="6 digit code" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} autoComplete="one-time-code" />
      <Button label="Confirm" onPress={verify} loading={busy} disabled={code.length !== 6} />
      <Button
        label="Send a new code"
        kind="ghost"
        onPress={async () => {
          await api('/auth/verify-email/resend', { method: 'POST' }).catch(() => undefined);
          setMsg({ tone: 'success', text: 'A new code is on its way.' });
        }}
      />
      <Button label="Do this later" kind="ghost" onPress={() => router.replace('/')} />
    </Screen>
  );
}
