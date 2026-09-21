import type { ReactNode } from 'react';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { darkTheme, UIRootProviders, useUITheme } from '@/ui/theme';

export const storybookBackgrounds = {
  default: 'carbon-black',
  values: [
    { name: 'carbon-black', value: darkTheme.semantic.bg.canvas },
    { name: 'asphalt', value: darkTheme.tokens.color['asphalt.900'] },
    { name: 'warning', value: darkTheme.semantic.accent.warning },
  ],
};

type StorybookPreviewFrameProps = {
  children: ReactNode;
};

export function StorybookPreviewFrame({
  children,
}: StorybookPreviewFrameProps) {
  return (
    <UIRootProviders>
      <StorybookPreviewChrome>{children}</StorybookPreviewChrome>
    </UIRootProviders>
  );
}

function StorybookPreviewChrome({ children }: StorybookPreviewFrameProps) {
  const theme = useUITheme();
  const styles = createStyles(theme);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.shell}>
        <View style={styles.textureStripeA} />
        <View style={styles.textureStripeB} />
        <View style={styles.textureStripeC} />
        <View style={styles.topBar}>
          <Text style={styles.headerLabel}>FOUNDATION / BLACKLIST HUD</Text>
          <View style={styles.headerSignal} />
        </View>
        <View style={styles.panel}>
          <View style={styles.cornerTopLeft} />
          <View style={styles.cornerTopRight} />
          <View style={styles.cornerBottomLeft} />
          <View style={styles.cornerBottomRight} />
          {children}
        </View>
      </View>
    </SafeAreaView>
  );
}

function createStyles(theme: typeof darkTheme) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      minHeight: 844,
      width: '100%',
      backgroundColor: theme.semantic.bg.canvas,
    },
    shell: {
      flex: 1,
      minHeight: 844,
      width: '100%',
      padding: theme.tokens.spacing['4'],
      backgroundColor: theme.semantic.bg.canvas,
    },
    textureStripeA: {
      position: 'absolute',
      top: -80,
      left: 22,
      width: 18,
      height: 620,
      backgroundColor: theme.tokens.color['asphalt.800'],
      opacity: 0.26,
      transform: [{ rotate: '18deg' }],
    },
    textureStripeB: {
      position: 'absolute',
      top: -80,
      left: 74,
      width: 10,
      height: 620,
      backgroundColor: theme.tokens.color['asphalt.900'],
      opacity: 0.44,
      transform: [{ rotate: '18deg' }],
    },
    textureStripeC: {
      position: 'absolute',
      top: -80,
      right: 58,
      width: 26,
      height: 620,
      backgroundColor: theme.tokens.color['carbon.800'],
      opacity: 0.38,
      transform: [{ rotate: '18deg' }],
    },
    topBar: {
      height: 34,
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: theme.tokens.border.width.thin,
      borderColor: theme.semantic.border.metal,
      backgroundColor: theme.semantic.surface.carbon,
      paddingHorizontal: theme.tokens.spacing['3'],
      gap: theme.tokens.spacing['2'],
      marginBottom: theme.tokens.spacing['3'],
    },
    headerLabel: {
      flex: 1,
      color: theme.semantic.fg.primary,
      fontFamily: theme.fontFamily.ui.bold,
      fontSize: theme.tokens.typography.size.caption,
      lineHeight: theme.tokens.typography.lineHeight.caption,
      letterSpacing: theme.tokens.typography.letterSpacing.wide,
    },
    headerSignal: {
      width: 8,
      height: 8,
      backgroundColor: theme.semantic.accent.warning,
    },
    panel: {
      flex: 1,
      borderWidth: theme.tokens.border.width.thin,
      borderColor: theme.semantic.border.metal,
      borderRadius: theme.tokens.radius.none,
      backgroundColor: theme.semantic.surface.panel,
      padding: theme.tokens.spacing['3'],
      justifyContent: 'center',
    },
    cornerTopLeft: {
      position: 'absolute',
      top: -6,
      left: -6,
      width: 18,
      height: 18,
      borderTopWidth: theme.tokens.border.width.base,
      borderLeftWidth: theme.tokens.border.width.base,
      borderColor: theme.semantic.accent.warning,
    },
    cornerTopRight: {
      position: 'absolute',
      top: -6,
      right: -6,
      width: 18,
      height: 18,
      borderTopWidth: theme.tokens.border.width.base,
      borderRightWidth: theme.tokens.border.width.base,
      borderColor: theme.semantic.accent.warning,
    },
    cornerBottomLeft: {
      position: 'absolute',
      bottom: -6,
      left: -6,
      width: 18,
      height: 18,
      borderBottomWidth: theme.tokens.border.width.base,
      borderLeftWidth: theme.tokens.border.width.base,
      borderColor: theme.semantic.accent.warning,
    },
    cornerBottomRight: {
      position: 'absolute',
      right: -6,
      bottom: -6,
      width: 18,
      height: 18,
      borderRightWidth: theme.tokens.border.width.base,
      borderBottomWidth: theme.tokens.border.width.base,
      borderColor: theme.semantic.accent.warning,
    },
  });
}
