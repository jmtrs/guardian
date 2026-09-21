import type { ReactNode } from 'react';
import { createContext, useContext } from 'react';

import type { UITheme } from '@/ui/theme/semantic';
import { darkTheme } from '@/ui/theme/semantic';

const UIThemeContext = createContext<UITheme>(darkTheme);

type UIThemeProviderProps = {
  children: ReactNode;
  theme?: UITheme;
};

export function UIThemeProvider({
  children,
  theme = darkTheme,
}: UIThemeProviderProps) {
  return (
    <UIThemeContext.Provider value={theme}>{children}</UIThemeContext.Provider>
  );
}

export function useUITheme() {
  return useContext(UIThemeContext);
}
