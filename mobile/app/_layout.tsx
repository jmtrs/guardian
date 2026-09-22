import { Component, useState, type ReactNode } from 'react';
import { LogBox, ScrollView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Slot } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { UIRootProviders, darkTheme } from '@/ui/theme';

const canvas = darkTheme.semantic.bg.canvas;

// React 19 + Fabric (Expo 57): error recuperable durante el render concurrente.
// React reintenta sincrono y recupera — solo ensucia LogBox en dev.
LogBox.ignoreLogs([
  'There was an error during concurrent rendering but React was able to recover',
]);

// TEMPORAL debug: si el root casca en Expo Go, mostrar el error en pantalla
// (sin adb no hay logcat). Quitar cuando el arranque sea estable.
class RootErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <ScrollView style={{ flex: 1, backgroundColor: '#0b0d10', padding: 24 }}>
          <Text style={{ color: '#ef4444', fontSize: 16, marginBottom: 12 }}>
            Root crash: {this.state.error.message}
          </Text>
          <Text style={{ color: '#94a3b8', fontSize: 12 }}>
            {this.state.error.stack}
          </Text>
        </ScrollView>
      );
    }
    return this.props.children;
  }
}

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
    <RootErrorBoundary>
      <UIRootProviders waitUntilFontsLoaded>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="light" />
          {/* Black backdrop behind the navigator so no white shows during
              screen transitions. */}
          <View style={{ flex: 1, backgroundColor: canvas }}>
            <Slot />
          </View>
        </QueryClientProvider>
      </UIRootProviders>
    </RootErrorBoundary>
  );
}
