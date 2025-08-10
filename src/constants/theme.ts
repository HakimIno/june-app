import type { Theme } from '@/types/common';

export const theme: Theme = {
  colors: {
    primary: '#f4511e',
    secondary: '#ff6b35',
    background: '#ffffff',
    surface: '#f5f5f5',
    text: '#333333',
    error: '#ff5252',
    success: '#4caf50',
    warning: '#ff9800',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
  typography: {
    sizes: {
      xs: 12,
      sm: 14,
      md: 16,
      lg: 18,
      xl: 24,
      xxl: 32,
    },
    weights: {
      normal: '400',
      medium: '500',
      bold: '700',
    },
  },
};

export const lightTheme = theme;

export const darkTheme: Theme = {
  ...theme,
  colors: {
    ...theme.colors,
    background: '#121212',
    surface: '#1e1e1e',
    text: '#ffffff',
  },
};
