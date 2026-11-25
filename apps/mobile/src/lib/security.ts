import JailMonkey from 'jail-monkey';
import { Platform } from 'react-native';
import { addSslPinningErrorListener, initializeSslPinning, isSslPinningAvailable } from 'react-native-ssl-public-key-pinning';
import * as AppIntegrity from '@expo/app-integrity';
import { config } from './config';

/**
 * Certificate pinning for the Ugo API. Two or more pins are shipped (current key plus backups)
 * and the pins expire on a set date, so a certificate change can never lock users out for good.
 */
export async function startPinning(): Promise<void> {
  if (!isSslPinningAvailable() || config.appEnv === 'development' || config.sslPins.length < 2) return;
  const host = new URL(config.apiUrl).hostname;
  await initializeSslPinning({
    [host]: { includeSubdomains: false, publicKeyHashes: config.sslPins, expirationDate: config.sslPinsExpire ?? undefined },
  });
  addSslPinningErrorListener((e) => console.warn(`Pinning failed for ${e.serverHostname}`));
}

/** Rooted or jailbroken phones can still practise, but cannot download paid videos for offline use. */
export function isCompromisedDevice(): boolean {
  if (Platform.OS === 'web') return false;
  try {
    return JailMonkey.isJailBroken();
  } catch {
    return false;
  }
}

/**
 * Asks Google Play Integrity (Android) or App Attest (iOS) to vouch for this copy of the app.
 * The token goes to the Ugo server, which checks it with Google or Apple. See docs/SECURITY.md.
 */
export async function integrityToken(requestHash: string): Promise<{ platform: 'android' | 'ios'; token: string; keyId?: string } | null> {
  try {
    if (!AppIntegrity.isSupported) return null;
    if (Platform.OS === 'android') {
      if (!config.googleCloudProjectNumber) return null;
      await AppIntegrity.prepareIntegrityTokenProviderAsync(config.googleCloudProjectNumber);
      return { platform: 'android', token: await AppIntegrity.requestIntegrityCheckAsync(requestHash) };
    }
    if (Platform.OS === 'ios') {
      const keyId = await AppIntegrity.generateKeyAsync();
      return { platform: 'ios', keyId, token: await AppIntegrity.attestKeyAsync(keyId, requestHash) };
    }
  } catch {
    // Simulators and some devices cannot attest; the server decides what that allows.
  }
  return null;
}
