import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import * as SecureStore from 'expo-secure-store';

/** Small, non secret preferences. Stored in the device keychain/keystore storage for simplicity. */
const storage: StateStorage = {
  getItem: (k) => SecureStore.getItemAsync(k),
  setItem: (k, v) => SecureStore.setItemAsync(k, v),
  removeItem: (k) => SecureStore.deleteItemAsync(k),
};

interface Settings {
  theme: 'system' | 'light' | 'dark';
  /** Blocks video downloads on mobile data and asks for smaller images. */
  dataSaver: boolean;
  /** Content updates download on Wi-Fi only unless switched off. */
  updatesOnWifiOnly: boolean;
  biometricUnlock: boolean;
  selectedExams: string[];
  set: (p: Partial<Omit<Settings, 'set'>>) => void;
}

export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      theme: 'system',
      dataSaver: true,
      updatesOnWifiOnly: true,
      biometricUnlock: false,
      selectedExams: [],
      set: (p) => set(p),
    }),
    { name: 'ugo.settings', storage: createJSONStorage(() => storage) },
  ),
);
