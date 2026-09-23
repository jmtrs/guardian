import { StyleSheet } from 'react-native';
import type { UITheme } from '@/ui/theme';

export function createStyles(theme: UITheme) {
  return StyleSheet.create({
    canvas: {
      flex: 1,
    },
    content: {
      padding: theme.tokens.spacing['6'],
      paddingTop: theme.tokens.spacing['14'],
      paddingBottom: theme.tokens.spacing['16'],
    },
    // Sin eventos (cargando o vacio definitivo): el contenedor ocupa todo el
    // alto para que el emptyWrap centre su contenido — el header queda arriba,
    // igual que MapScreen sin posicion.
    contentEmpty: {
      flex: 1,
    },
    // Cabecera propia: back + titulo — sin header bar del Stack.
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.tokens.spacing['4'],
      marginBottom: theme.tokens.spacing['6'],
    },
    backButton: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.semantic.border.metal,
      backgroundColor: theme.semantic.bg.surface,
    },
    backIcon: {
      color: theme.semantic.accent.warning,
      fontSize: 16,
      textShadowColor: theme.semantic.glow.text,
      textShadowRadius: 6,
    },
    headerBlock: {
      gap: theme.tokens.spacing['1'],
    },
    title: {
      color: theme.semantic.fg.primary,
      fontFamily: theme.fontFamily.display,
      fontSize: 20,
      letterSpacing: 4,
      textTransform: 'uppercase',
    },
    muted: {
      color: theme.semantic.fg.muted,
      fontFamily: theme.fontFamily.ui.regular,
      fontSize: 14,
      textAlign: 'center',
      marginTop: theme.tokens.spacing['8'],
    },
    // Envoltorio del loader/EmptyState: centrado en el alto que sobra bajo
    // el header, no en toda la pantalla.
    emptyWrap: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    // Pie de lista: spinner mientras carga la siguiente pagina (lazy load).
    footerLoader: {
      paddingVertical: theme.tokens.spacing['4'],
    },
    // Timeline: rail izquierdo con glifos + linea que conecta.
    timelineRow: {
      flexDirection: 'row',
      minHeight: 64,
    },
    rail: {
      alignItems: 'center',
      width: 32,
    },
    glyphBox: {
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.semantic.border.metal,
      backgroundColor: theme.semantic.bg.hudPanel,
    },
    glyphBoxAlert: {
      borderColor: theme.semantic.border.danger,
    },
    glyph: {
      color: theme.semantic.fg.secondary,
      fontFamily: theme.fontFamily.ui.regular,
      fontSize: 12,
    },
    glyphAlert: {
      color: theme.semantic.accent.red,
    },
    railLine: {
      flex: 1,
      width: 1,
      backgroundColor: theme.semantic.border.subtle,
      marginVertical: theme.tokens.spacing['1'],
    },
    rowBody: {
      flex: 1,
      paddingLeft: theme.tokens.spacing['4'],
      paddingBottom: theme.tokens.spacing['5'],
      justifyContent: 'center',
      gap: theme.tokens.spacing['1'],
    },
    rowTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      gap: theme.tokens.spacing['3'],
    },
    kindText: {
      color: theme.semantic.fg.primary,
      fontFamily: theme.fontFamily.ui.medium,
      fontSize: 14,
      flex: 1,
    },
    kindTextAlert: {
      color: theme.semantic.accent.red,
    },
    time: {
      color: theme.semantic.fg.muted,
      fontFamily: theme.fontFamily.ui.regular,
      fontSize: 12,
    },
    metaText: {
      color: theme.semantic.fg.muted,
      fontFamily: theme.fontFamily.ui.regular,
      fontSize: 12,
      letterSpacing: 0.5,
    },
  });
}

export type EventsStyles = ReturnType<typeof createStyles>;
