import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Slot } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { UIRootProviders } from '@/ui/theme';

export default function RootLayout() {
  // Lazy: sobrevive a recargas del modulo en Fast Refresh.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, staleTime: 15_000, refetchOnWindowFocus: false },
        },
      }),
  );

  return (
    <UIRootProviders waitUntilFontsLoaded>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="light" />
        <Slot />
      </QueryClientProvider>
    </UIRootProviders>
  );
}
