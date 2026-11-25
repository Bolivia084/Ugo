import { useQuery } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { api } from '../../lib/api';
import { wipeLocalData } from '../../lib/db';
import { useSession } from '../../lib/session';
import { Banner, Button, Card, Field, Loading, Screen, T } from '../../components/ui';

export interface Child {
  id: string;
  displayName: string;
  fullName: string;
  dateOfBirth: string | null;
  hasOwnLogin: boolean;
  allowLeaderboard: boolean;
  consentGivenAt: string;
}

/** Parent home: children, consent codes and adding a child profile. */
export default function ParentHome() {
  const router = useRouter();
  const me = useSession((s) => s.me);
  const { data, isLoading, refetch } = useQuery({ queryKey: ['children'], queryFn: () => api<Child[]>('/parents/children') });
  const [code, setCode] = useState('');
  const [form, setForm] = useState({ fullName: '', displayName: '', dateOfBirth: '' });
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null);
    try {
      await fn();
      setMsg({ tone: 'success', text: ok });
      await refetch();
    } catch (e) {
      setMsg({ tone: 'error', text: (e as Error).message });
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Parent account' }} />
      <T v="title">Hello, {me?.displayName}</T>
      {me && !me.emailVerified ? <Banner tone="warn" text="Verify your email address to add children or approve accounts." /> : null}
      {me && !me.emailVerified ? <Button label="Verify email" kind="secondary" onPress={() => router.push('/verify-email')} /> : null}
      {msg ? <Banner tone={msg.tone} text={msg.text} /> : null}
      <T v="heading">My children</T>
      {isLoading ? <Loading /> : null}
      {data?.length === 0 ? <T v="muted">No children yet. Add a profile below, or enter the code from an email your child triggered.</T> : null}
      {data?.map((c) => (
        <Card key={c.id} onPress={() => router.push({ pathname: '/parent/[childId]', params: { childId: c.id, name: c.displayName } })} accessibilityLabel={`${c.displayName}, open progress`}>
          <T v="heading">{c.displayName}</T>
          <T v="small">{c.hasOwnLogin ? 'Has own sign in' : 'Uses this phone'} · consent given {new Date(c.consentGivenAt).toLocaleDateString()}</T>
        </Card>
      ))}
      <Card>
        <T v="heading">Approve a child's account</T>
        <T v="muted">If your child signed up and named your email, enter the 8 digit code we emailed you.</T>
        <Field label="8 digit code" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={8} />
        <Button label="Approve" disabled={code.length !== 8} onPress={() => run(() => api('/parents/consent', { body: { code } }), 'Approved. Your child can now use Ugo.')} />
      </Card>
      <Card>
        <T v="heading">Add a child profile</T>
        <T v="muted">For younger children who will use Ugo on this phone. By adding a profile you consent, as their parent or guardian, to Ugo processing their study data as described in the privacy policy.</T>
        <Field label="Child's full name" value={form.fullName} onChangeText={(v) => setForm({ ...form, fullName: v })} />
        <Field label="Display name" value={form.displayName} onChangeText={(v) => setForm({ ...form, displayName: v })} maxLength={24} />
        <Field label="Date of birth (YYYY-MM-DD)" value={form.dateOfBirth} onChangeText={(v) => setForm({ ...form, dateOfBirth: v })} maxLength={10} keyboardType="numbers-and-punctuation" />
        <Button label="Add child" disabled={!form.fullName || !form.displayName || !form.dateOfBirth} onPress={() => run(() => api('/parents/children', { body: form }), 'Profile added.')} />
      </Card>
      <Button label="Sign in security (MFA)" kind="ghost" onPress={() => router.push('/security')} />
      <Button label="Delete my account" kind="ghost" onPress={() => router.push('/delete-account')} />
      <Button
        label="Sign out"
        kind="secondary"
        onPress={async () => {
          await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
          await wipeLocalData();
          await useSession.getState().clear();
          router.replace('/welcome');
        }}
      />
    </Screen>
  );
}
