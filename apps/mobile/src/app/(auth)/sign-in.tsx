import { useRouter } from 'expo-router';
import { useState } from 'react';
import { api } from '../../lib/api';
import { type Tokens, useSession } from '../../lib/session';
import { Banner, Button, Field, Screen, T } from '../../components/ui';

type LoginResponse = ({ mfaRequired: false } & Tokens) | { mfaRequired: true; challengeId: string; method: 'EMAIL_OTP' | 'SMS_OTP' | 'TOTP' };

export default function SignIn() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState<{ id: string; method: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = async (t: Tokens) => {
    await useSession.getState().setTokens(t);
    router.replace('/');
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api<LoginResponse>('/auth/login', { auth: false, body: { email: email.trim(), password } });
      if (res.mfaRequired) setChallenge({ id: res.challengeId, method: res.method });
      else await finish(res);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      await finish(await api<Tokens>('/auth/mfa/verify', { auth: false, body: { challengeId: challenge!.id, code: code.trim() } }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (challenge) {
    return (
      <Screen>
        <T v="title">Enter your code</T>
        <T v="muted">{challenge.method === 'TOTP' ? 'Open your authenticator app and enter the 6 digit code for Ugo.' : `We sent a 6 digit code to ${email}. It expires in 10 minutes.`}</T>
        {error ? <Banner tone="error" text={error} /> : null}
        <Field label="6 digit code" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} autoComplete="one-time-code" textContentType="oneTimeCode" />
        <Button label="Continue" onPress={verify} loading={busy} disabled={code.length !== 6} />
        <Button label="Start again" kind="ghost" onPress={() => setChallenge(null)} />
      </Screen>
    );
  }

  return (
    <Screen>
      <T v="title">Sign in</T>
      {error ? <Banner tone="error" text={error} /> : null}
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="username" />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" textContentType="password" />
      <Button label="Sign in" onPress={submit} loading={busy} disabled={!email || !password} />
      <Button label="Forgot password?" kind="ghost" onPress={() => router.push('/forgot-password')} />
    </Screen>
  );
}
