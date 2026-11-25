import { Platform } from 'react-native';
import {
  endConnection,
  fetchProducts,
  finishTransaction,
  getAvailablePurchases,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  isUserCancelledError,
  type Purchase,
  type ProductSubscription,
} from 'expo-iap';
import type { ExamCode } from '@ugo/shared';
import { api } from './api';
import { useEntitlements } from './entitlements';

export interface CatalogPlan {
  code: ExamCode;
  name: string;
  appleProductId: string | null;
  googleProductId: string | null;
}

export interface StorePrice {
  sku: string;
  displayPrice: string;
  offerToken?: string;
}

let listeners: { remove: () => void }[] = [];
let connected = false;

/**
 * Store billing: Google Play Billing on Android, StoreKit 2 on iOS.
 * Every purchase is verified by the Ugo server before the transaction is finished,
 * and the purchase is tied to the Ugo account (appAccountToken / obfuscatedAccountId).
 */
export async function startBilling(onError: (message: string) => void): Promise<void> {
  if (connected || Platform.OS === 'web') return;
  connected = await initConnection().catch(() => false);
  listeners = [
    purchaseUpdatedListener(async (purchase: Purchase) => {
      try {
        await verifyWithServer(purchase);
        await finishTransaction({ purchase, isConsumable: false });
      } catch (e) {
        onError((e as Error).message);
      }
    }),
    purchaseErrorListener((err) => {
      if (!isUserCancelledError(err)) onError(err.message ?? 'The purchase did not complete');
    }),
  ];
}

export async function stopBilling(): Promise<void> {
  listeners.forEach((l) => l.remove());
  listeners = [];
  if (connected) await endConnection();
  connected = false;
}

async function verifyWithServer(purchase: Purchase): Promise<void> {
  if (!purchase.purchaseToken) throw new Error('Missing purchase token');
  const snap =
    Platform.OS === 'ios'
      ? await api<{ entitlements: never[]; signed: string }>('/billing/apple/verify', { body: { signedTransaction: purchase.purchaseToken } })
      : await api<{ entitlements: never[]; signed: string }>('/billing/google/verify', { body: { purchaseToken: purchase.purchaseToken, productId: purchase.productId } });
  void snap;
  await useEntitlements.getState().refresh();
}

/** Prices always come from the store, never from the app or the Ugo server. */
export async function storePrices(plans: CatalogPlan[]): Promise<Record<string, StorePrice>> {
  if (!connected) return {};
  const skus = plans.map((p) => (Platform.OS === 'ios' ? p.appleProductId : p.googleProductId)).filter((s): s is string => Boolean(s));
  if (!skus.length) return {};
  const products = ((await fetchProducts({ skus, type: 'subs' })) ?? []) as ProductSubscription[];
  const out: Record<string, StorePrice> = {};
  for (const p of products) {
    const offer = 'subscriptionOffers' in p ? p.subscriptionOffers?.[0] : undefined;
    out[p.id] = { sku: p.id, displayPrice: offer?.displayPrice ?? p.displayPrice, offerToken: offer?.offerTokenAndroid ?? undefined };
  }
  return out;
}

export async function buy(plan: CatalogPlan, price: StorePrice, userId: string): Promise<void> {
  await requestPurchase({
    type: 'subs',
    request: {
      apple: { sku: price.sku, appAccountToken: userId },
      google: {
        skus: [price.sku],
        obfuscatedAccountId: userId,
        subscriptionOffers: price.offerToken ? [{ sku: price.sku, offerToken: price.offerToken }] : undefined,
      },
    },
  });
}

/** "Restore purchases": sends every purchase the store knows about to the server for checking. */
export async function restore(): Promise<{ restored: number; errors: string[] }> {
  const purchases = await getAvailablePurchases();
  const body =
    Platform.OS === 'ios'
      ? { apple: purchases.map((p) => p.purchaseToken).filter(Boolean), google: [] }
      : { apple: [], google: purchases.filter((p) => p.purchaseToken).map((p) => ({ purchaseToken: p.purchaseToken!, productId: p.productId })) };
  const res = await api<{ errors: string[] }>('/billing/restore', { body });
  await useEntitlements.getState().refresh();
  for (const p of purchases) await finishTransaction({ purchase: p, isConsumable: false }).catch(() => undefined);
  return { restored: purchases.length, errors: res.errors };
}
