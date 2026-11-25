import * as Clipboard from 'expo-clipboard';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { api } from '../lib/api';
import { type Me, useSession } from '../lib/session';
import { Banner, Button, Card, Field, Screen, T } from '../components/ui';

/** Multi factor sign in: email codes (default) or an authenticator app. */
export default function Security() {
  const me = useSession((s) => s.me);
  const [password, setPassword] = useState('');
  const [setup, setSetup] = useState<{ otpauthUrl: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const refreshMe = async () => useSession.getState().setMe(await api<Me>('/me'));

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Sign in security' }} />
      <T v="muted">Each time you sign in on a new device we ask for a second step. Currently: {me?.mfaMethod === 'TOTP' ? 'authenticator app' : 'a code sent to your email'}.</T>
      {msg ? <Banner tone={msg.tone} text={msg.text} /> : null}
      <Field label="Current password" value={password} onChangeText={setPassword} secureTextEntry />
      {!setup ? (
        <Card>
          <T v="heading">Use an authenticator app</T>
          <T v="muted">Google Authenticator, Microsoft Authenticator or similar.</T>
          <Button
            label="Set up authenticator app"
            disabled={!password}
            onPress={async () => {
              try {
                setSetup(await api('/auth/mfa/method', { body: { method: 'TOTP', password } }));
              } catch (e) {
                setMsg({ tone: 'error', text: (e as Error).message });
              }
            }}
          />
        </Card>
      ) : (
        <Card>
          <T>Add this key to your authenticator app, then enter the 6 digit code it shows.</T>
          <T v="heading" style={{ letterSpacing: 2 }}>{setup.secret}</T>
          <Button label="Copy key" kind="ghost" onPress={() => Clipboard.setStringAsync(setup.secret)} />
          <Field label="6 digit code" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} />
          <Button
            label="Confirm"
            onPress={async () => {
              try {
                await api('/auth/mfa/totp/confirm', { body: { code } });
                await refreshMe();
                setSetup(null);
                setMsg({ tone: 'success', text: 'Authenticator app is now your second step.' });
              } catch (e) {
                setMsg({ tone: 'error', text: (e as Error).message });
              }
            }}
          />
        </Card>
      )}
      {me?.mfaMethod === 'TOTP' ? (
        <Button
          label="Switch back to email codes"
          kind="ghost"
          disabled={!password}
          onPress={async () => {
            try {
              await api('/auth/mfa/method', { body: { method: 'EMAIL_OTP', password } });
              await refreshMe();
              setMsg({ tone: 'success', text: 'You will get sign in codes by email.' });
            } catch (e) {
              setMsg({ tone: 'error', text: (e as Error).message });
            }
          }}
        />
      ) : null}
      <Button
        label="Sign out on all devices"
        kind="secondary"
        onPress={async () => {
          await api('/auth/logout-all', { method: 'POST' });
          await useSession.getState().clear();
        }}
      />
    </Screen>
  );
}
