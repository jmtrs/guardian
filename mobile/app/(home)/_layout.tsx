import { Redirect, Stack } from 'expo-router';

import { authClient } from '@/api/auth-client';
import { ScreenLoader } from '@/ui/composites/ScreenLoader';
import { darkTheme } from '@/ui/theme';

const canvas = darkTheme.semantic.bg.canvas;

export default function HomeLayout() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return <ScreenLoader />;
  }

  // Guard: sin sesion activa se vuelve al login.
  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  // Sin header bar: cada pantalla compone su propia cabecera (HUD-style).
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: canvas },
        animation: 'none',
      }}
    />
  );
}
