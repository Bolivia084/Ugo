import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Platform } from 'react-native';
import type { ExamCode } from '@ugo/shared';
import { api } from '../lib/api';
import { useEntitlements } from '../lib/entitlements';
import { useCatalog } from '../lib/hooks';
import { buy, restore, startBilling, storePrices, type StorePrice } from '../lib/iap';
import { useSession } from '../lib/session';
import { Banner, Button, Card, Field, Loading, Pill, Row, Screen, T } from '../components/ui';

/**
 * Annual plans per exam. Prices shown are always the ones the store returns.
 * Web checkout is not linked from inside the apps (store rules).
 */
export default function Plans() {
  const { data: catalog } = useCatalog();
  const me = useSession((s) => s.me);
  const { has, rows } = useEntitlements();
  const [prices, setPrices] = useState<Record<string, StorePrice>>({});
  const [loadingPrices, setLoadingPrices] = useState(true);
  const [msg, setMsg] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [promo, setPromo] = useState('');

  useEffect(() => {
    if (!catalog) return;
    void (async () => {
      await startBilling((m) => setMsg({ tone: 'error', text: m }));
      setPrices(await storePrices(catalog).catch(() => ({})));
      setLoadingPrices(false);
    })();
  }, [catalog]);

  if (!catalog || !me) return <Loading />;
  const sku = (c: (typeof catalog)[number]) => (Platform.OS === 'ios' ? c.appleProductId : c.googleProductId);

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Plans' }} />
      <T v="title">Annual plans</T>
      <T v="muted">Each exam is a separate plan. A plan unlocks everything in that exam for 12 months: all subjects, past questions, mock exams, notes, videos, flashcards and the AI tutor (fair use limit). Buy more than one plan if you are preparing for more than one exam.</T>
      {msg ? <Banner tone={msg.tone} text={msg.text} /> : null}
      {loadingPrices ? <Loading label="Getting prices from the store" /> : null}
      {catalog.map((c) => {
        const price = sku(c) ? prices[sku(c)!] : undefined;
        const active = has(c.code);
        const ent = rows.find((r) => r.examCode === c.code && r.active);
        return (
          <Card key={c.code}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T v="heading">{c.name}</T>
              {active ? <Pill label="Active" /> : null}
            </Row>
            {active && ent ? (
              <T v="muted">{ent.autoRenew ? `Renews on ${new Date(ent.expiresAt).toLocaleDateString()}. You will get a reminder 7 days before.` : `Access until ${new Date(ent.expiresAt).toLocaleDateString()}.`}</T>
            ) : price ? (
              <>
                <T>{price.displayPrice} per year, renews automatically. Cancel at any time in your {Platform.OS === 'ios' ? 'App Store' : 'Google Play'} subscriptions; access continues until the end of the paid year.</T>
                <Button
                  label={`Subscribe for ${price.displayPrice} a year`}
                  loading={busy === c.code}
                  onPress={async () => {
                    setBusy(c.code);
                    setMsg(null);
                    try {
                      await buy(c, price, me.id);
                      setMsg({ tone: 'info', text: 'Finishing your purchase. Your plan unlocks as soon as the store confirms it.' });
                    } catch (e) {
                      setMsg({ tone: 'error', text: (e as Error).message });
                    } finally {
                      setBusy(null);
                    }
                  }}
                />
              </>
            ) : !loadingPrices ? (
              <T v="small">Not available from the store right now.</T>
            ) : null}
          </Card>
        );
      })}
      <Button
        label="Restore purchases"
        kind="secondary"
        onPress={async () => {
          try {
            const r = await restore();
            setMsg({ tone: r.errors.length ? 'error' : 'success', text: r.errors.length ? r.errors.join('\n') : r.restored ? 'Purchases restored.' : 'No purchases found for this store account.' });
          } catch (e) {
            setMsg({ tone: 'error', text: (e as Error).message });
          }
        }}
      />
      <Card>
        <T v="heading">Have a code from your school or a partner?</T>
        <Field label="Code" value={promo} onChangeText={(v) => setPromo(v.toUpperCase())} autoCapitalize="characters" />
        <Row>
          {catalog.map((c) => (
            <Button
              key={c.code}
              label={`Use for ${c.code}`}
              kind="ghost"
              disabled={!promo}
              onPress={async () => {
                try {
                  await api('/billing/promo/redeem', { body: { code: promo, examCode: c.code as ExamCode } });
                  await useEntitlements.getState().refresh();
                  setMsg({ tone: 'success', text: `${c.name} unlocked.` });
                } catch (e) {
                  setMsg({ tone: 'error', text: (e as Error).message });
                }
              }}
            />
          ))}
        </Row>
      </Card>
      <Button label={Platform.OS === 'ios' ? 'Manage subscriptions' : 'Manage subscriptions in Google Play'} kind="ghost" onPress={() => Linking.openURL(Platform.OS === 'ios' ? 'https://apps.apple.com/account/subscriptions' : 'https://play.google.com/store/account/subscriptions')} />
    </Screen>
  );
}
