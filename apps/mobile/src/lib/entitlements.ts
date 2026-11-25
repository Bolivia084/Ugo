import { ed25519 } from '@noble/curves/ed25519.js';
import { hasAccess, type ExamCode, type SignedEntitlementPayload } from '@ugo/shared';
import { create } from 'zustand';
import { api } from './api';
import { config } from './config';
import { kvGet, kvSet } from './db';

export interface EntitlementRow {
  examCode: ExamCode;
  source: string;
  status: string;
  startsAt: string;
  expiresAt: string;
  autoRenew: boolean;
  active: boolean;
}

interface Snapshot {
  entitlements: EntitlementRow[];
  signed: string;
}

const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64url = (s: string) => b64(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '='));

/** Checks the server's Ed25519 signature, so a tampered cache cannot unlock paid content. */
export function verifySigned(token: string, publicKeyB64: string, userId: string): SignedEntitlementPayload | null {
  try {
    const [body, sig] = token.split('.');
    if (!body || !sig) return null;
    const ok = ed25519.verify(b64url(sig), new TextEncoder().encode(body), b64(publicKeyB64));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64url(body))) as SignedEntitlementPayload;
    return payload.sub === userId ? payload : null;
  } catch {
    return null;
  }
}

interface EntitlementState {
  rows: EntitlementRow[];
  offline: SignedEntitlementPayload | null;
  has: (code: ExamCode) => boolean;
  refresh: () => Promise<void>;
  loadCached: (userId: string, publicKey: string | null) => Promise<void>;
  apply: (snap: Snapshot, userId: string, publicKey: string | null) => Promise<void>;
}

export const useEntitlements = create<EntitlementState>()((set, get) => ({
  rows: [],
  offline: null,
  has: (code) => {
    const { rows, offline } = get();
    if (rows.length) return rows.some((r) => r.examCode === code && r.active && new Date(r.expiresAt) > new Date());
    return offline ? hasAccess(offline.entitlements, code) : false;
  },
  async refresh() {
    const snap = await api<Snapshot>('/billing/entitlements');
    const userId = (await kvGet<string>('userId')) ?? '';
    await get().apply(snap, userId, (await kvGet<string>('entitlementPublicKey')) ?? config.entitlementPublicKey);
  },
  async apply(snap, userId, publicKey) {
    await kvSet('entitlements.signed', snap.signed);
    const payload = publicKey ? verifySigned(snap.signed, publicKey, userId) : null;
    set({ rows: snap.entitlements, offline: payload });
  },
  async loadCached(userId, publicKey) {
    const token = await kvGet<string>('entitlements.signed');
    const key = config.entitlementPublicKey ?? publicKey;
    if (!token || !key) return;
    set({ offline: verifySigned(token, key, userId) });
  },
}));
