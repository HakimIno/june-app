export * from './theme';

// App constants
export const APP_NAME = 'June TV';
export const APP_VERSION = '1.0.0';

// API constants
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8080';
export const API_TIMEOUT = 10000;

// Storage keys
export const STORAGE_KEYS = {
  USER_TOKEN: 'user_token',
  USER_PREFERENCES: 'user_preferences',
  THEME_MODE: 'theme_mode',
} as const;

// Screen names
export const SCREEN_NAMES = {
  HOME: 'Home',
  MAIN_TABS: 'MainTabs',
} as const;
