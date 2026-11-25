import { Stack } from 'expo-router';
import { useTheme } from '../../theme/theme';

export default function AuthLayout() {
  const t = useTheme();
  return <Stack screenOptions={{ headerTintColor: t.colors.primary, headerStyle: { backgroundColor: t.colors.background }, headerTitle: '', headerShadowVisible: false }} />;
}
