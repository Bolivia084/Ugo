import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform } from 'react-native';
import { api } from '../lib/api';
import { config } from '../lib/config';
import { wipeLocalData } from '../lib/db';
import { stopBilling } from '../lib/iap';
import { useSession } from '../lib/session';
import { Banner, Button, Field, Screen, T } from '../components/ui';

/** In app account deletion, as both stores require. Also available on the website. */
export default function DeleteAccount() {
  const router = useRouter();
  const me = useSession((s) => s.me);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Screen>
      <Stack.Screen options={{ title: 'Delete account' }} />
      <T v="title">Delete your Ugo account</T>
      <T>This permanently deletes your profile, progress, flashcards and settings.{me?.role === 'PARENT' ? ' Child profiles you created are deleted too.' : ''}</T>
      <Banner tone="warn" text={`Deleting your account does not cancel a store subscription. Cancel it first in ${Platform.OS === 'ios' ? 'App Store' : 'Google Play'} subscriptions so you are not charged again.`} />
      <Button label="Manage store subscriptions" kind="ghost" onPress={() => Linking.openURL(Platform.OS === 'ios' ? 'https://apps.apple.com/account/subscriptions' : 'https://play.google.com/store/account/subscriptions')} />
      {error ? <Banner tone="error" text={error} /> : null}
      <Field label="Enter your password to confirm" value={password} onChangeText={setPassword} secureTextEntry />
      <Button
        label="Delete my account"
        kind="danger"
        loading={busy}
        disabled={!password}
        onPress={async () => {
          setBusy(true);
          setError(null);
          try {
            await api('/me', { method: 'DELETE', body: { password } });
            await stopBilling();
            await wipeLocalData();
            await useSession.getState().clear();
            router.replace('/welcome');
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      />
      <T v="small">You can also delete your account at {config.websiteUrl}/delete-account.</T>
    </Screen>
  );
}
