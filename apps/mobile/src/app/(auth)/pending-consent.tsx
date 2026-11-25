import { useRouter } from 'expo-router';
import { useState } from 'react';
import { api } from '../../lib/api';
import { type Me, useSession } from '../../lib/session';
import { Banner, Button, Screen, T } from '../../components/ui';

/** Learners under 18 wait here until a parent or guardian approves the account. */
export default function PendingConsent() {
  const router = useRouter();
  const [note, setNote] = useState<string | null>(null);
  const check = async () => {
    const me = await api<Me>('/me');
    useSession.getState().setMe(me);
    if (me.status === 'ACTIVE') router.replace('/');
    else setNote('Not approved yet. Ask your parent or guardian to check their email for the Ugo code.');
  };
  return (
    <Screen>
      <T v="title">Waiting for your parent or guardian</T>
      <T v="muted">We emailed your parent or guardian a code. Once they approve your account in their Ugo parent account, you can start studying.</T>
      {note ? <Banner text={note} /> : null}
      <Button label="I have been approved" onPress={check} />
      <Button
        label="Sign out"
        kind="ghost"
        onPress={async () => {
          await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
          await useSession.getState().clear();
          router.replace('/welcome');
        }}
      />
    </Screen>
  );
}
