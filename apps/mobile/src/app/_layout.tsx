import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Network from 'expo-network';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { mustUpdate, type ExamCode } from '@ugo/shared';
import { api } from '../lib/api';
import { appVersion, config } from '../lib/config';
import { kvSet } from '../lib/db';
import { useEntitlements } from '../lib/entitlements';
import { startBilling } from '../lib/iap';
import { syncPack } from '../lib/packs';
import { registerForPush } from '../lib/push';
import { startPinning } from '../lib/security';
import { type Me, useSession } from '../lib/session';
import { useSettings } from '../lib/settings';
import { syncNow } from '../lib/sync';
import { Button, Screen, T } from '../components/ui';
import { useTheme } from '../theme/theme';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <Root />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

function Root() {
  const t = useTheme();
  const router = useRouter();
  const { tokens, locked } = useSession();
  const [booted, setBooted] = useState(false);

  // Start up: pinning, forced update check, stored session, biometric lock.
  useEffect(() => {
    (async () => {
      await startPinning().catch(() => undefined);
      try {
        const cfg = await api<{ minSupportedVersion: string; entitlementPublicKey: string }>('/app-config', { auth: false, timeoutMs: 8000 });
        await kvSet('entitlementPublicKey', cfg.entitlementPublicKey);
        if (mustUpdate(appVersion, cfg.minSupportedVersion)) {
          setBooted(true);
          router.replace('/update-required');
          return;
        }
      } catch {
        // Offline start: carry on with what is stored on the phone.
      }
      const stored = await useSession.getState().load();
      if (stored && useSettings.getState().biometricUnlock) useSession.getState().lock();
      setBooted(true);
    })();
  }, [router]);

  // Once signed in (and unlocked): profile, plans, billing, push, sync and background content updates.
  useEffect(() => {
    if (!booted || !tokens || locked) return;
    (async () => {
      try {
        const me = await api<Me>('/me');
        useSession.getState().setMe(me);
        await kvSet('userId', me.id);
        await useEntitlements.getState().loadCached(me.id, null);
        if (me.status !== 'ACTIVE') return;
        await useEntitlements.getState().refresh().catch(() => undefined);
        if (me.role === 'LEARNER') {
          await startBilling(() => undefined);
          void registerForPush().catch(() => undefined);
          void syncNow();
          const { selectedExams, updatesOnWifiOnly } = useSettings.getState();
          for (const code of selectedExams) await syncPack(code as ExamCode, { background: true, wifiOnly: updatesOnWifiOnly }).catch(() => undefined);
        } else {
          void registerForPush().catch(() => undefined);
        }
      } catch {
        // Offline: the cached signed entitlement keeps paid content open.
      }
    })();
  }, [booted, tokens, locked]);

  // Sync again when the connection comes back or the app returns to the foreground.
  useEffect(() => {
    const net = Network.addNetworkStateListener((s) => {
      if (s.isInternetReachable) void syncNow();
    });
    const app = AppState.addEventListener('change', (s) => {
      if (s === 'active') void syncNow();
    });
    return () => {
      net.remove();
      app.remove();
    };
  }, []);

  if (!booted) return <View style={{ flex: 1, backgroundColor: t.colors.primary }} />;
  if (locked) return <LockScreen />;

  return (
    <ThemeProvider value={t.dark ? DarkTheme : DefaultTheme}>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerTintColor: t.colors.primary, headerStyle: { backgroundColor: t.colors.background }, headerTitleStyle: { color: t.colors.text }, contentStyle: { backgroundColor: t.colors.background } }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="update-required" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="mock/[code]" options={{ title: 'Mock exam', gestureEnabled: false }} />
        <Stack.Screen name="quiz/[subjectId]" options={{ title: 'Practice' }} />
      </Stack>
    </ThemeProvider>
  );
}

function LockScreen() {
  const [error, setError] = useState<string | null>(null);
  const unlock = async () => {
    const res = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock Ugo', cancelLabel: 'Cancel' });
    if (res.success) useSession.getState().unlock();
    else setError('Not unlocked. Try again, or sign out and sign in with your password.');
  };
  useEffect(() => {
    void unlock();
  }, []);
  return (
    <Screen>
      <T v="hero">Ugo is locked</T>
      <T v="muted">Use your fingerprint, face or phone passcode to continue.</T>
      {error ? <T color="#C62828">{error}</T> : null}
      <Button label="Unlock" onPress={unlock} />
      <Button
        label="Sign out"
        kind="ghost"
        onPress={async () => {
          await useSession.getState().clear();
          useSession.getState().unlock();
        }}
      />
      <T v="small">Version {appVersion} · {config.appEnv}</T>
    </Screen>
  );
}
