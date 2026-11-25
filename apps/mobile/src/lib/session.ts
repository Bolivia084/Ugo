import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

/**
 * Tokens live only in the iOS Keychain or Android Keystore (expo-secure-store),
 * readable only while the device is unlocked and never backed up to another device.
 */
const OPTS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const KEY = 'ugo.session.v1';
const PARENT_KEY = 'ugo.parentSession.v1';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
}

export interface Me {
  id: string;
  email: string;
  role: 'LEARNER' | 'PARENT' | 'TUTOR' | 'CONTENT_STAFF' | 'SUPPORT' | 'ADMIN';
  status: 'ACTIVE' | 'PENDING_CONSENT' | 'SUSPENDED' | 'DELETED';
  fullName: string;
  displayName: string;
  dateOfBirth: string | null;
  age: number | null;
  emailVerified: boolean;
  mfaMethod: 'EMAIL_OTP' | 'SMS_OTP' | 'TOTP';
  leaderboardOptIn: boolean;
  hasParent: boolean;
}

interface SessionState {
  ready: boolean;
  locked: boolean;
  tokens: Tokens | null;
  me: Me | null;
  /** Set while a parent has handed the phone to a child profile. */
  parentTokens: Tokens | null;
  setTokens: (t: Tokens | null) => Promise<void>;
  setMe: (me: Me | null) => void;
  load: () => Promise<Tokens | null>;
  unlock: () => void;
  lock: () => void;
  enterChildProfile: (child: Tokens) => Promise<void>;
  returnToParent: () => Promise<boolean>;
  clear: () => Promise<void>;
}

export const useSession = create<SessionState>()((set, get) => ({
  ready: false,
  locked: false,
  tokens: null,
  me: null,
  parentTokens: null,
  async setTokens(t) {
    if (t) await SecureStore.setItemAsync(KEY, JSON.stringify(t), OPTS);
    else await SecureStore.deleteItemAsync(KEY, OPTS);
    set({ tokens: t });
  },
  setMe: (me) => set({ me }),
  async load() {
    const raw = await SecureStore.getItemAsync(KEY, OPTS);
    const parentRaw = await SecureStore.getItemAsync(PARENT_KEY, OPTS);
    const tokens = raw ? (JSON.parse(raw) as Tokens) : null;
    set({ tokens, parentTokens: parentRaw ? (JSON.parse(parentRaw) as Tokens) : null, ready: true });
    return tokens;
  },
  unlock: () => set({ locked: false }),
  lock: () => set({ locked: true }),
  async enterChildProfile(child) {
    const current = get().tokens;
    if (current) await SecureStore.setItemAsync(PARENT_KEY, JSON.stringify(current), OPTS);
    set({ parentTokens: current, me: null });
    await get().setTokens(child);
  },
  async returnToParent() {
    const p = get().parentTokens;
    if (!p) return false;
    await SecureStore.deleteItemAsync(PARENT_KEY, OPTS);
    set({ parentTokens: null, me: null });
    await get().setTokens(p);
    return true;
  },
  async clear() {
    await SecureStore.deleteItemAsync(KEY, OPTS);
    await SecureStore.deleteItemAsync(PARENT_KEY, OPTS);
    set({ tokens: null, me: null, parentTokens: null });
  },
}));
