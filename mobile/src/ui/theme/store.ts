import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEFAULT_ACCENT } from './palette';

// Front-end-only theme prefs, same load/save-patch idiom as autobahn's
// app-settings.js — persisted to AsyncStorage so the picked skin survives
// restarts. `presetId: 'custom'` means honor `customAccent` instead.
export type ThemeSettings = {
  presetId: string;
  customAccent: string;
};

export const DEFAULT_THEME_SETTINGS: ThemeSettings = {
  presetId: 'amber',
  customAccent: DEFAULT_ACCENT,
};

const STORAGE_KEY = 'guardian.theme';

export async function loadThemeSettings(): Promise<ThemeSettings> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_THEME_SETTINGS;
    return { ...DEFAULT_THEME_SETTINGS, ...(JSON.parse(raw) as Partial<ThemeSettings>) };
  } catch {
    return DEFAULT_THEME_SETTINGS;
  }
}

export async function saveThemeSettings(settings: ThemeSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Best-effort: a failed persist just means it won't survive a restart.
  }
}
