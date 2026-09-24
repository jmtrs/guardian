import { StyleSheet } from 'react-native';
import type { UITheme } from '@/ui/theme';

export function createStyles(theme: UITheme) {
  const { semantic, tokens, fontFamily } = theme;
  return StyleSheet.create({
    // Cabecera + selectores + resumen fijos; solo el cuerpo (lista) scrollea.
    container: {
      flex: 1,
      paddingHorizontal: tokens.spacing['6'],
      paddingTop: tokens.spacing['14'],
    },
    // Region flexible bajo el resumen: grafica o lista scrollable.
    body: {
      flex: 1,
    },
    // Padding inferior del contenido scrollable de la lista.
    listContent: {
      paddingBottom: tokens.spacing['16'],
    },
    contentEmpty: {
      flex: 1,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.spacing['4'],
      marginBottom: tokens.spacing['6'],
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
    title: {
      color: semantic.fg.primary,
      fontFamily: fontFamily.display,
      fontSize: 20,
      letterSpacing: 4,
      textTransform: 'uppercase',
    },
    // Selectores (pills tema VFD): granularidad + vista.
    selectorBlock: {
      gap: tokens.spacing['2'],
      marginBottom: tokens.spacing['4'],
    },
    selectorLabel: {
      color: semantic.fg.muted,
      fontFamily: fontFamily.ui.regular,
      fontSize: 11,
      letterSpacing: 2,
      textTransform: 'uppercase',
    },
    pillRow: {
      flexDirection: 'row',
      gap: tokens.spacing['2'],
    },
    pill: {
      flex: 1,
      paddingVertical: tokens.spacing['2'],
      alignItems: 'center',
      borderWidth: 1,
      borderColor: semantic.border.metal,
      backgroundColor: semantic.bg.surface,
    },
    pillActive: {
      borderColor: semantic.accent.warning,
      backgroundColor: semantic.bg.hudPanel,
    },
    pillPressed: {
      opacity: 0.7,
    },
    pillLabel: {
      color: semantic.fg.muted,
      fontFamily: fontFamily.ui.medium,
      fontSize: 12,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    pillLabelActive: {
      color: semantic.accent.warning,
    },
    // Resumen fijo de la ventana.
    summary: {
      borderWidth: 1,
      borderColor: semantic.border.metal,
      backgroundColor: semantic.bg.surface,
      padding: tokens.spacing['4'],
      gap: tokens.spacing['2'],
      marginBottom: tokens.spacing['5'],
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
    },
    summaryLabel: {
      color: semantic.fg.muted,
      fontFamily: fontFamily.ui.regular,
      fontSize: 12,
    },
    summaryValue: {
      color: semantic.fg.primary,
      fontFamily: fontFamily.ui.medium,
      fontSize: 13,
    },
    // Contenedor de la grafica.
    chartWrap: {
      borderWidth: 1,
      borderColor: semantic.border.subtle,
      backgroundColor: semantic.bg.hudPanel,
      padding: tokens.spacing['2'],
    },
    // Filas de la vista lista.
    listRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: tokens.spacing['3'],
      gap: tokens.spacing['3'],
    },
    listRowDivider: {
      borderTopWidth: 1,
      borderTopColor: semantic.border.subtle,
    },
    listBucket: {
      color: semantic.fg.secondary,
      fontFamily: fontFamily.ui.medium,
      fontSize: 13,
      flex: 1,
    },
    listValueBlock: {
      alignItems: 'flex-end',
      gap: 1,
    },
    listValueMain: {
      color: semantic.fg.primary,
      fontFamily: fontFamily.ui.medium,
      fontSize: 15,
    },
    listValueSub: {
      color: semantic.fg.muted,
      fontFamily: fontFamily.ui.regular,
      fontSize: 11,
    },
    emptyWrap: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
  });
}

export type BatteryStyles = ReturnType<typeof createStyles>;
