import Constants from 'expo-constants';

interface Extra {
  appEnv: 'development' | 'staging' | 'production';
  apiUrl: string;
  websiteUrl: string;
  supportEmail: string;
  entitlementPublicKey: string | null;
  sslPins: string[];
  sslPinsExpire: string | null;
  googleCloudProjectNumber: string | null;
  eas?: { projectId?: string };
}

export const config = Constants.expoConfig?.extra as Extra;
export const appVersion = Constants.expoConfig?.version ?? '0.0.0';
