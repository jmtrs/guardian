import { StatusBar } from 'expo-status-bar';
import { Slot } from 'expo-router';

import { UIRootProviders } from '@/ui/theme';

export default function RootLayout() {
  return (
    <UIRootProviders waitUntilFontsLoaded>
      <StatusBar style="light" />
      <Slot />
    </UIRootProviders>
  );
}
