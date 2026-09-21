import { Orbitron_700Bold } from '@expo-google-fonts/orbitron';
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_600SemiBold,
  JetBrainsMono_700Bold,
} from '@expo-google-fonts/jetbrains-mono';
import { useFonts } from 'expo-font';

import type { TypographyWeight } from '@/ui/foundations';

export const uiFontAssets = {
  Orbitron_700Bold,
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_600SemiBold,
  JetBrainsMono_700Bold,
} as const;

export type UIFontFamily = {
  display: string;
  ui: Record<TypographyWeight, string>;
};

export const uiFontFamily: UIFontFamily = {
  display: 'Orbitron_700Bold',
  ui: {
    regular: 'JetBrainsMono_400Regular',
    medium: 'JetBrainsMono_500Medium',
    semibold: 'JetBrainsMono_600SemiBold',
    bold: 'JetBrainsMono_700Bold',
  },
};

export function useUIFonts() {
  return useFonts(uiFontAssets);
}

export function getUIFontFamily(
  role: keyof UIFontFamily,
  weight: TypographyWeight = 'regular'
) {
  if (role === 'display') {
    return uiFontFamily.display;
  }

  return uiFontFamily.ui[weight];
}
