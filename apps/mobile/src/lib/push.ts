import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api';
import { config } from './config';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

/** Asks for permission once and registers this device for study reminders and renewal notices. */
export async function registerForPush(): Promise<void> {
  if (!Device.isDevice || Platform.OS === 'web') return;
  const { status } = await Notifications.getPermissionsAsync();
  const final = status === 'granted' ? status : (await Notifications.requestPermissionsAsync()).status;
  if (final !== 'granted') return;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'Study reminders', importance: Notifications.AndroidImportance.DEFAULT });
  }
  const token = await Notifications.getExpoPushTokenAsync({ projectId: config.eas?.projectId });
  await api('/devices', { body: { token: token.data, platform: Platform.OS === 'ios' ? 'IOS' : 'ANDROID' } });
}
