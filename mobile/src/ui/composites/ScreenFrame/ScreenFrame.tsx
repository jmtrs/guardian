import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { useUITheme } from '@/ui/theme';

// Lightweight instrument-cluster shell. The pixel grid lives once at the app
// root so route changes do not rebuild or restart decorative effects.

type ScreenFrameProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

export function ScreenFrame({ children, style }: ScreenFrameProps) {
  const theme = useUITheme();

  return (
    <View style={[{ flex: 1, backgroundColor: theme.semantic.bg.canvas }, style]}>
      <View style={{ flex: 1 }}>{children}</View>

      <View
        pointerEvents="none"
        style={[FILL, { borderWidth: 1, borderColor: theme.semantic.bg.bezel }]}
      />
    </View>
  );
}
