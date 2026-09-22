import { StyleSheet } from 'react-native';
import type { UITheme } from '@/ui/theme';
import { withAlpha } from '@/ui/theme';

export function createStyles(theme: UITheme) {
  const { semantic, tokens, fontFamily } = theme;
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    map: {
      flex: 1,
      backgroundColor: semantic.bg.canvas,
    },
    // Tapa a pantalla completa sobre el mapa hasta que carga el estilo.
    mapCover: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: semantic.bg.canvas,
    },
    // Cabecera flotante sobre el mapa: back + titulo, estilo HUD.
    header: {
      position: 'absolute',
      top: tokens.spacing['14'],
      left: tokens.spacing['6'],
      right: tokens.spacing['6'],
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.spacing['4'],
    },
    backButton: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: semantic.border.metal,
      backgroundColor: semantic.bg.surface,
    },
    backIcon: {
      color: semantic.accent.warning,
      fontSize: 16,
      textShadowColor: semantic.glow.text,
      textShadowRadius: 6,
    },
    headerBlock: {
      gap: tokens.spacing['1'],
    },
    title: {
      color: semantic.fg.primary,
      fontFamily: fontFamily.display,
      fontSize: 20,
      letterSpacing: 4,
      textTransform: 'uppercase',
    },
    subtitle: {
      color: semantic.fg.muted,
      fontFamily: fontFamily.ui.regular,
      fontSize: 12,
      letterSpacing: 2,
      textTransform: 'uppercase',
    },
    // Estado sin posicion — centra el EmptyState.
    emptyWrap: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: tokens.spacing['6'],
    },
    emptyHeader: {
      position: 'relative',
      top: 0,
      left: 0,
      right: 0,
      marginTop: tokens.spacing['14'],
      marginHorizontal: tokens.spacing['6'],
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.spacing['4'],
    },
    // Marcador de posicion actual.
    marker: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 2,
      borderColor: semantic.accent.warning,
      backgroundColor: semantic.bg.canvas,
    },
    // Tarjeta inferior flotante: direccion + coords + navegacion.
    infoCard: {
      position: 'absolute',
      left: tokens.spacing['6'],
      right: tokens.spacing['6'],
      bottom: tokens.spacing['12'],
      borderWidth: 1,
      borderColor: semantic.border.metal,
      backgroundColor: withAlpha(semantic.bg.surface, 0.82),
      padding: tokens.spacing['5'],
      gap: tokens.spacing['1'],
      ...theme.elevation.raised,
      shadowColor: semantic.accent.warning,
    },
    infoLabel: {
      color: semantic.fg.muted,
      fontFamily: fontFamily.ui.medium,
      fontSize: 11,
      letterSpacing: 3,
      textTransform: 'uppercase',
    },
    infoAddress: {
      color: semantic.accent.warning,
      fontFamily: fontFamily.display,
      fontSize: 18,
      letterSpacing: 1,
      textShadowColor: semantic.glow.text,
      textShadowRadius: 6,
    },
    infoDetail: {
      color: semantic.fg.secondary,
      fontFamily: fontFamily.ui.regular,
      fontSize: 13,
    },
    infoCoords: {
      color: semantic.fg.muted,
      fontFamily: fontFamily.ui.regular,
      fontSize: 12,
      letterSpacing: 0.5,
      marginTop: tokens.spacing['1'],
    },
    navRow: {
      flexDirection: 'row',
      gap: tokens.spacing['3'],
      marginTop: tokens.spacing['3'],
    },
    navButton: {
      flex: 1,
    },
    navButtonLabel: {
      fontSize: 12,
      letterSpacing: 1,
    },
  });
}

export type MapStyles = ReturnType<typeof createStyles>;
