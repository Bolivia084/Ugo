import { Tabs } from 'expo-router/js-tabs';
import { Text, type ColorValue } from 'react-native';
import { useTheme } from '../../theme/theme';

const icon = (glyph: string) => ({ color }: { color: ColorValue }) => <Text style={{ color, fontSize: 20 }}>{glyph}</Text>;

export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: t.colors.primary,
        tabBarInactiveTintColor: t.colors.textMuted,
        tabBarStyle: { backgroundColor: t.colors.background, borderTopColor: t.colors.border, minHeight: 60 },
        tabBarLabelStyle: { fontSize: 13, fontWeight: '600' },
        headerStyle: { backgroundColor: t.colors.background },
        headerTitleStyle: { color: t.colors.text },
      }}
    >
      <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: icon('⌂'), tabBarAccessibilityLabel: 'Home' }} />
      <Tabs.Screen name="practice" options={{ title: 'Practice', tabBarIcon: icon('✎'), tabBarAccessibilityLabel: 'Practice' }} />
      <Tabs.Screen name="mocks" options={{ title: 'Mock exams', tabBarIcon: icon('⏱'), tabBarAccessibilityLabel: 'Mock exams' }} />
      <Tabs.Screen name="progress" options={{ title: 'Progress', tabBarIcon: icon('▤'), tabBarAccessibilityLabel: 'Progress' }} />
      <Tabs.Screen name="me" options={{ title: 'Me', tabBarIcon: icon('☺'), tabBarAccessibilityLabel: 'My account' }} />
    </Tabs>
  );
}
