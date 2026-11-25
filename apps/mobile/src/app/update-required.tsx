import { Linking, Platform } from 'react-native';
import { Button, Screen, T } from '../components/ui';

/** Shown when this version is below the minimum supported version set in the admin dashboard. */
export default function UpdateRequired() {
  const url = Platform.OS === 'ios' ? 'https://apps.apple.com/app/id0000000000' : 'market://details?id=ng.ugo.app';
  return (
    <Screen>
      <T v="hero">Please update Ugo</T>
      <T v="muted">This version of Ugo is no longer supported. Updating keeps your account and your study data safe. Your progress is saved.</T>
      <Button label="Update now" onPress={() => Linking.openURL(url)} />
    </Screen>
  );
}
