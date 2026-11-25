import { useColorScheme } from 'react-native';
import { useSettings } from '../lib/settings';

/** Deep blue and white with green and gold accents. Contrast ratios meet WCAG AA for text. */
const palette = {
  blue900: '#0B2A6F',
  blue700: '#1A44A8',
  blue100: '#E6EDFB',
  green: '#16834A',
  greenLight: '#3CCB7F',
  gold: '#F2B705',
  red: '#C62828',
  redLight: '#FF8A80',
};

export const lightTheme = {
  dark: false,
  colors: {
    background: '#FFFFFF',
    surface: '#F4F7FD',
    card: '#FFFFFF',
    border: '#D5DDEE',
    text: '#0E1630',
    textMuted: '#4A5675',
    primary: palette.blue900,
    primaryText: '#FFFFFF',
    accent: palette.green,
    gold: palette.gold,
    danger: palette.red,
    success: palette.green,
    tint: palette.blue100,
  },
};

export const darkTheme: typeof lightTheme = {
  dark: true,
  colors: {
    background: '#0A1228',
    surface: '#121C38',
    card: '#162246',
    border: '#2A3963',
    text: '#F1F4FB',
    textMuted: '#B3BEDA',
    primary: '#6F95FF',
    primaryText: '#0A1228',
    accent: palette.greenLight,
    gold: palette.gold,
    danger: palette.redLight,
    success: palette.greenLight,
    tint: '#1D2C57',
  },
};

export type Theme = typeof lightTheme;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };
export const radius = { sm: 8, md: 12, lg: 20 };
/** Base sizes. Text still scales with the phone's font size setting. */
export const font = { small: 14, body: 16, large: 18, title: 22, hero: 28 };

export function useTheme(): Theme {
  const system = useColorScheme();
  const pref = useSettings((s) => s.theme);
  const mode = pref === 'system' ? system : pref;
  return mode === 'dark' ? darkTheme : lightTheme;
}
