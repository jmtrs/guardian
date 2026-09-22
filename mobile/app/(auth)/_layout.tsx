import { Stack } from 'expo-router';

import { darkTheme } from '@/ui/theme';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: darkTheme.semantic.bg.canvas },
        animation: 'none',
      }}
    />
  );
}
