import type { ReactNode } from 'react';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { I18nextProvider } from 'react-i18next';

import { UIThemeProvider } from './UIThemeProvider';
import { useUIFonts } from '@/ui/theme/fonts';
import i18n from '@/lib/i18n';

type UIRootProvidersProps = {
  children: ReactNode;
  waitUntilFontsLoaded?: boolean;
};

export function UIRootProviders({
  children,
  waitUntilFontsLoaded = false,
}: UIRootProvidersProps) {
  const [fontsLoaded] = useUIFonts();

  if (waitUntilFontsLoaded && !fontsLoaded) {
    return null;
  }

  return (
    <I18nextProvider i18n={i18n}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <UIThemeProvider>
            <BottomSheetModalProvider>{children}</BottomSheetModalProvider>
          </UIThemeProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </I18nextProvider>
  );
}
