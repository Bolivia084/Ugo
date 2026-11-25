import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * One codebase, three environments. APP_ENV is set per EAS build profile (see eas.json).
 * Each environment has its own API, database and keys on the server side.
 */
const APP_ENV = (process.env.APP_ENV ?? 'development') as 'development' | 'staging' | 'production';

const API_URL: Record<typeof APP_ENV, string> = {
  development: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000',
  staging: 'https://api.staging.ugo.ng',
  production: 'https://api.ugo.ng',
};

const ids = APP_ENV === 'production' ? { ios: 'ng.ugo.app', android: 'ng.ugo.app' } : { ios: `ng.ugo.app.${APP_ENV}`, android: `ng.ugo.app.${APP_ENV}` };

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: APP_ENV === 'production' ? 'Ugo' : `Ugo (${APP_ENV})`,
  slug: 'ugo',
  scheme: 'ugo',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  runtimeVersion: { policy: 'appVersion' },
  updates: {
    // Over the air updates carry bug fixes only, never new features (see docs/MAINTENANCE_PLAN.md).
    url: process.env.EAS_UPDATE_URL,
    checkAutomatically: 'ON_LOAD',
    fallbackToCacheTimeout: 0,
  },
  ios: {
    bundleIdentifier: ids.ios,
    supportsTablet: true,
    config: { usesNonExemptEncryption: false },
    infoPlist: {
      // App Transport Security stays on: plain HTTP is blocked.
      ITSAppUsesNonExemptEncryption: false,
    },
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyTrackingDomains: [],
      NSPrivacyCollectedDataTypes: [],
      NSPrivacyAccessedAPITypes: [],
    },
  },
  android: {
    package: ids.android,
    adaptiveIcon: {
      backgroundColor: '#0B2A6F',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    allowBackup: false,
    // No advertising id, no location, no camera or microphone.
    blockedPermissions: ['com.google.android.gms.permission.AD_ID', 'android.permission.SYSTEM_ALERT_WINDOW', 'android.permission.ACCESS_FINE_LOCATION', 'android.permission.ACCESS_COARSE_LOCATION', 'android.permission.CAMERA', 'android.permission.RECORD_AUDIO', 'android.permission.READ_EXTERNAL_STORAGE', 'android.permission.WRITE_EXTERNAL_STORAGE'],
  },
  web: { favicon: './assets/favicon.png' },
  plugins: [
    'expo-router',
    ['expo-splash-screen', { image: './assets/splash-icon.png', imageWidth: 200, backgroundColor: '#0B2A6F' }],
    ['expo-sqlite', { useSQLCipher: true }],
    ['expo-secure-store', { faceIDPermission: 'Ugo uses Face ID to unlock your account.' }],
    ['expo-local-authentication', { faceIDPermission: 'Ugo uses Face ID to unlock your account.' }],
    ['expo-notifications', { color: '#0B2A6F' }],
    'expo-localization',
    'expo-font',
    'expo-video',
    'expo-image',
    'expo-web-browser',
    'expo-iap',
    [
      'expo-build-properties',
      {
        android: {
          compileSdkVersion: 36,
          targetSdkVersion: 36,
          // Shrinks and obfuscates release builds.
          enableMinifyInReleaseBuilds: true,
          enableShrinkResourcesInReleaseBuilds: true,
          usesCleartextTraffic: false,
        },
      },
    ],
  ],
  experiments: { typedRoutes: true },
  extra: {
    appEnv: APP_ENV,
    apiUrl: API_URL[APP_ENV],
    websiteUrl: 'https://ugo.ng',
    supportEmail: 'support@ugo.ng',
    // Raw Ed25519 public key (base64) that signs offline entitlements. Set per environment before release.
    entitlementPublicKey: process.env.ENTITLEMENT_PUBLIC_KEY ?? null,
    // SPKI SHA-256 pins for the API host: current key and at least one backup key.
    sslPins: (process.env.API_SSL_PINS ?? '').split(',').filter(Boolean),
    sslPinsExpire: process.env.API_SSL_PINS_EXPIRE ?? null,
    googleCloudProjectNumber: process.env.GOOGLE_CLOUD_PROJECT_NUMBER ?? null,
    eas: { projectId: process.env.EAS_PROJECT_ID },
  },
});
