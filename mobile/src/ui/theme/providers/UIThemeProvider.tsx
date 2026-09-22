import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

import type { UITheme } from '@/ui/theme/semantic';
import { buildTheme, darkTheme } from '@/ui/theme/semantic';
import { THEME_PRESETS } from '@/ui/theme/palette';
import {
  DEFAULT_THEME_SETTINGS,
  loadThemeSettings,
  saveThemeSettings,
  type ThemeSettings,
} from '@/ui/theme/store';

const UIThemeContext = createContext<UITheme>(darkTheme);

type ThemeControls = {
  settings: ThemeSettings;
  activeAccent: string;
  setPreset: (presetId: string) => void;
  setCustomAccent: (hex: string) => void;
};

const UIThemeControlsContext = createContext<ThemeControls>({
  settings: DEFAULT_THEME_SETTINGS,
  activeAccent: DEFAULT_THEME_SETTINGS.customAccent,
  setPreset: () => {},
  setCustomAccent: () => {},
});

function resolveAccent(settings: ThemeSettings): string {
  if (settings.presetId === 'custom') return settings.customAccent;
  const preset = THEME_PRESETS.find((p) => p.id === settings.presetId);
  return preset?.accent ?? THEME_PRESETS[0].accent;
}

type UIThemeProviderProps = {
  children: ReactNode;
  /** Fixed theme override — used by Storybook / tests, bypasses persistence. */
  theme?: UITheme;
};

export function UIThemeProvider({ children, theme }: UIThemeProviderProps) {
  const [settings, setSettings] = useState<ThemeSettings>(DEFAULT_THEME_SETTINGS);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate from storage once. Default is AMBER (same as first paint), so there
  // is no theme flash before the stored value lands.
  useEffect(() => {
    if (theme) return;
    let alive = true;
    loadThemeSettings().then((stored) => {
      if (alive) setSettings(stored);
    });
    return () => {
      alive = false;
    };
  }, [theme]);

  const activeAccent = resolveAccent(settings);

  const resolvedTheme = useMemo(
    () => theme ?? buildTheme(activeAccent),
    [theme, activeAccent],
  );

  const controls = useMemo<ThemeControls>(() => {
    // State updates live (instant retint); the AsyncStorage write is debounced
    // so dragging the accent slider doesn't fire a write per frame.
    const persist = (next: ThemeSettings) => {
      setSettings(next);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void saveThemeSettings(next), 300);
    };
    return {
      settings,
      activeAccent,
      setPreset: (presetId) => persist({ ...settings, presetId }),
      setCustomAccent: (hex) =>
        persist({ ...settings, presetId: 'custom', customAccent: hex }),
    };
  }, [settings, activeAccent]);

  return (
    <UIThemeContext.Provider value={resolvedTheme}>
      <UIThemeControlsContext.Provider value={controls}>
        {children}
      </UIThemeControlsContext.Provider>
    </UIThemeContext.Provider>
  );
}

export function useUITheme() {
  return useContext(UIThemeContext);
}

export function useThemeControls() {
  return useContext(UIThemeControlsContext);
}
