import { useRouter } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import { Linking, Switch, View } from 'react-native';
import { api } from '../../lib/api';
import { appVersion, config } from '../../lib/config';
import { wipeLocalData } from '../../lib/db';
import { useEntitlements } from '../../lib/entitlements';
import { stopBilling } from '../../lib/iap';
import { useSession } from '../../lib/session';
import { useSettings } from '../../lib/settings';
import { Button, Card, Row, Screen, T } from '../../components/ui';

export default function MeScreen() {
  const router = useRouter();
  const me = useSession((s) => s.me);
  const rows = useEntitlements((s) => s.rows);
  const s = useSettings();

  const signOut = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    await stopBilling();
    await wipeLocalData();
    await useSession.getState().clear();
    router.replace('/welcome');
  };

  return (
    <Screen>
      <T v="title">{me?.displayName}</T>
      <T v="muted">{me?.email.endsWith('@children.ugo.local') ? 'Profile managed by your parent' : me?.email}</T>

      <Card>
        <T v="heading">My plans</T>
        {rows.filter((r) => r.active).length === 0 ? <T v="muted">You are on the free level.</T> : null}
        {rows.filter((r) => r.active).map((r) => (
          <T key={`${r.examCode}-${r.source}`}>
            {r.examCode}: {r.autoRenew ? 'renews' : 'ends'} {new Date(r.expiresAt).toLocaleDateString()}
          </T>
        ))}
        <Button label="Plans and prices" onPress={() => router.push('/plans')} />
      </Card>

      <Card>
        <T v="heading">Settings</T>
        <Toggle label="Data saver" hint="No video downloads on mobile data, smaller images" value={s.dataSaver} onChange={(v) => s.set({ dataSaver: v })} />
        <Toggle label="Download updates on Wi-Fi only" value={s.updatesOnWifiOnly} onChange={(v) => s.set({ updatesOnWifiOnly: v })} />
        <Toggle
          label="Unlock with fingerprint or face"
          value={s.biometricUnlock}
          onChange={async (v) => {
            if (v) {
              const ok = (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
              if (!ok) return;
              const res = await LocalAuthentication.authenticateAsync({ promptMessage: 'Turn on biometric unlock' });
              if (!res.success) return;
            }
            s.set({ biometricUnlock: v });
          }}
        />
        <Row>
          {(['system', 'light', 'dark'] as const).map((m) => (
            <Button key={m} label={m === 'system' ? 'Auto theme' : m === 'light' ? 'Light' : 'Dark'} kind={s.theme === m ? 'primary' : 'ghost'} onPress={() => s.set({ theme: m })} />
          ))}
        </Row>
      </Card>

      <Card>
        <T v="heading">Account and privacy</T>
        <Button label="Sign in security (MFA)" kind="ghost" onPress={() => router.push('/security')} />
        <Button label="Privacy policy" kind="ghost" onPress={() => Linking.openURL(`${config.websiteUrl}/privacy`)} />
        <Button label="Terms of use" kind="ghost" onPress={() => Linking.openURL(`${config.websiteUrl}/terms`)} />
        <Button label="Contact support" kind="ghost" onPress={() => Linking.openURL(`mailto:${config.supportEmail}`)} />
        <Button label="Delete my account" kind="ghost" onPress={() => router.push('/delete-account')} />
      </Card>

      <Button label="Sign out" kind="secondary" onPress={signOut} />
      <T v="small" center>
        Ugo {appVersion} · {config.appEnv}
      </T>
    </Screen>
  );
}

function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
      <View style={{ flex: 1 }}>
        <T>{label}</T>
        {hint ? <T v="small">{hint}</T> : null}
      </View>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} />
    </Row>
  );
}
