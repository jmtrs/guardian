import { View, ActivityIndicator } from 'react-native';
import { Redirect, Stack } from 'expo-router';

import { authClient } from '@/api/auth-client';
import { uiFontFamily } from '@/ui/theme/fonts';

export default function HomeLayout() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0b0d10', justifyContent: 'center' }}>
        <ActivityIndicator color="#b45309" />
      </View>
    );
  }

  // Guard: sin sesion activa se vuelve al login.
  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#0b0d10' },
        headerTintColor: '#e2e8f0',
        headerTitleStyle: { fontFamily: uiFontFamily.ui.semibold },
        contentStyle: { backgroundColor: '#0b0d10' },
      }}
    />
  );
}
