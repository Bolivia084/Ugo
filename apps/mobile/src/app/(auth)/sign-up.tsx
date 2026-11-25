import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, Switch, View } from 'react-native';
import { ageOn, ADULT_AGE } from '@ugo/shared';
import { api } from '../../lib/api';
import { config } from '../../lib/config';
import { type Tokens, useSession } from '../../lib/session';
import { Banner, Button, Field, Row, Screen, T } from '../../components/ui';

const TERMS_VERSION = '2026-11';

export default function SignUp() {
  const router = useRouter();
  const { role = 'LEARNER' } = useLocalSearchParams<{ role?: 'LEARNER' | 'PARENT' }>();
  const [form, setForm] = useState({ fullName: '', displayName: '', email: '', password: '', dateOfBirth: '', parentEmail: '' });
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const age = useMemo(() => (/^\d{4}-\d{2}-\d{2}$/.test(form.dateOfBirth) ? ageOn(form.dateOfBirth) : null), [form.dateOfBirth]);
  const isChild = role === 'LEARNER' && age !== null && age < ADULT_AGE;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api<Tokens & { status: string }>('/auth/register', {
        auth: false,
        body: { role, ...form, email: form.email.trim(), parentEmail: isChild ? form.parentEmail.trim() || undefined : undefined, acceptedTermsVersion: TERMS_VERSION },
      });
      await useSession.getState().setTokens(res);
      router.replace('/verify-email');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <T v="title">{role === 'PARENT' ? 'Parent or guardian account' : 'Learner account'}</T>
      {error ? <Banner tone="error" text={error} /> : null}
      <Field label="Full name" value={form.fullName} onChangeText={set('fullName')} autoComplete="name" />
      <Field label="Display name (shown on leaderboards, not your real name)" value={form.displayName} onChangeText={set('displayName')} maxLength={24} />
      <Field label="Email" value={form.email} onChangeText={set('email')} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <Field label="Password (10 or more characters, with a number)" value={form.password} onChangeText={set('password')} secureTextEntry autoComplete="new-password" />
      <Field label="Date of birth (YYYY-MM-DD)" value={form.dateOfBirth} onChangeText={set('dateOfBirth')} placeholder="2010-04-15" keyboardType="numbers-and-punctuation" maxLength={10} />
      {isChild ? (
        <View style={{ gap: 8 }}>
          <Banner text="Because you are under 18, a parent or guardian must approve your account before you can start. We will email them a code." />
          <Field label="Parent or guardian email" value={form.parentEmail} onChangeText={set('parentEmail')} autoCapitalize="none" keyboardType="email-address" />
        </View>
      ) : null}
      {role === 'PARENT' && age !== null && age < ADULT_AGE ? <Banner tone="error" text="Parent and guardian accounts are for adults (18 and over)." /> : null}
      <Row style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
        <Switch value={accepted} onValueChange={setAccepted} accessibilityLabel="I agree to the terms of use and privacy policy" />
        <T v="muted" style={{ flex: 1 }}>I agree to the Ugo terms of use and privacy policy.</T>
      </Row>
      <Row>
        <Button label="Read terms" kind="ghost" onPress={() => Linking.openURL(`${config.websiteUrl}/terms`)} />
        <Button label="Read privacy policy" kind="ghost" onPress={() => Linking.openURL(`${config.websiteUrl}/privacy`)} />
      </Row>
      <Button label="Create account" onPress={submit} loading={busy} disabled={!accepted || !form.email || !form.password || !form.dateOfBirth || (isChild && !form.parentEmail)} />
    </Screen>
  );
}
