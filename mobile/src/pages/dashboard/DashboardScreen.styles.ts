import { StyleSheet } from 'react-native';
import type { UITheme } from '@/ui/theme';
import { withAlpha } from '@/ui/theme';

export function createStyles(theme: UITheme) {
  const { semantic, tokens, fontFamily } = theme;
  // Fondo de card semi-transparente: deja ver la rejilla/canvas por debajo.
  const cardBg = withAlpha(semantic.bg.surface, 0.72);
  return StyleSheet.create({
    // Columna: la lista ocupa el alto disponible, CTA anclado al pie.
    container: {
      flex: 1,
    },
    list: {
      flex: 1,
    },
    // Cabecera fija (fuera del scroll).
    header: {
      paddingHorizontal: tokens.spacing['6'],
      paddingTop: tokens.spacing['14'],
    },
    content: {
      paddingHorizontal: tokens.spacing['6'],
      paddingTop: tokens.spacing['2'],
      paddingBottom: tokens.spacing['1'],
    },
    // Recuadros estaticos (sin dispositivo) — mantiene el padding del scroll.
    staticContent: {
      flex: 1,
      paddingHorizontal: tokens.spacing['6'],
      paddingTop: tokens.spacing['14'],
      gap: tokens.spacing['6'],
    },
    // Cada slot arrastrable: separacion entre recuadros.
    cardSlot: {
      marginBottom: tokens.spacing['5'],
    },
    // Fila de identidad: wordmark + acciones. Sin header bar.
    wordmarkRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: tokens.spacing['6'],
    },
    wordmark: {
      color: semantic.accent.warning,
      fontFamily: fontFamily.display,
      fontSize: 13,
      letterSpacing: 6,
      textTransform: 'uppercase',
    },
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.spacing['4'],
    },
    gearButton: {
      width: 30,
      height: 30,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: semantic.border.metal,
      backgroundColor: cardBg,
    },
    gearIcon: {
      color: semantic.accent.warning,
      fontSize: 15,
      textShadowColor: semantic.glow.text,
      textShadowRadius: 6,
    },
    logout: {
      color: semantic.fg.muted,
      fontFamily: fontFamily.ui.regular,
      fontSize: 12,
      letterSpacing: 1,
    },
    pressed: {
      opacity: 0.6,
    },
    // Hero de estado — protagonista visual.
    statusPanel: {
      borderWidth: 1,
      borderColor: semantic.border.metal,
      backgroundColor: cardBg,
      padding: tokens.spacing['6'],
      gap: tokens.spacing['3'],
      overflow: 'hidden',
      ...theme.elevation.raised,
      shadowColor: semantic.accent.warning,
    },
    statusPanelAlert: {
      borderColor: semantic.border.danger,
      shadowColor: semantic.accent.red,
    },
    statusPanelTrip: {
      borderColor: semantic.accent.dirtyAmber,
    },
    statusPanelWorkshop: {
      borderColor: semantic.accent.dirtyAmber,
      shadowColor: semantic.accent.dirtyAmber,
    },
    // Alerta reconocida ("Revisado"): baja de rojo a ambar. Sigue siendo un
    // hecho activo (no cerrado), pero deja de gritar tras el reconocimiento.
    statusPanelAck: {
      borderColor: semantic.accent.warning,
      shadowColor: semantic.accent.warning,
    },
    // Placeholder animado (HUDScan / LaneStripe) tras el contenido del panel.
    statusOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    statusText: {
      color: semantic.accent.warning,
      fontFamily: fontFamily.display,
      fontSize: 30,
      lineHeight: 38,
      letterSpacing: 2,
      // Reserva 2 lineas: "ARMADO" (1) y "VIAJE AUTORIZADO" (2) ocupan igual →
      // el panel no cambia de alto al iniciar/terminar viaje.
      minHeight: 76,
      // Centrado H y V dentro de las 2 lineas reservadas.
      textAlign: 'center',
      textAlignVertical: 'center',
    },
    statusTextAlert: {
      color: semantic.accent.red,
    },
    statusTextTrip: {
      color: semantic.accent.warning,
    },
    statusTextWorkshop: {
      color: semantic.accent.dirtyAmber,
    },
    statusTextAck: {
      color: semantic.accent.warning,
    },
    // Subline del incidente: cuenta atras de taller / estado "revisado".
    incidentSub: {
      color: semantic.fg.muted,
      fontFamily: fontFamily.ui.regular,
      fontSize: 12,
      letterSpacing: 1,
      textAlign: 'center',
    },
    incidentSubAlert: {
      color: semantic.accent.red,
    },
    // Boton "Revisado": reconoce la alerta SIN desarmar.
    ackButton: {
      alignSelf: 'center',
      marginTop: tokens.spacing['1'],
      paddingHorizontal: tokens.spacing['5'],
      paddingVertical: tokens.spacing['2'],
      borderWidth: 1,
      borderColor: semantic.border.danger,
      backgroundColor: semantic.bg.inset,
    },
    ackButtonText: {
      color: semantic.accent.red,
      fontFamily: fontFamily.ui.medium,
      fontSize: 12,
      letterSpacing: 2,
      textTransform: 'uppercase',
    },
    metaBlock: {
      gap: tokens.spacing['2'],
      marginTop: tokens.spacing['2'],
      borderTopWidth: 1,
      borderTopColor: semantic.border.subtle,
      paddingTop: tokens.spacing['4'],
    },
    metaRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    metaLabel: {
      color: semantic.fg.muted,
      fontFamily: fontFamily.ui.regular,
      fontSize: 12,
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    metaValue: {
      color: semantic.fg.primary,
      fontFamily: fontFamily.ui.regular,
      fontSize: 12,
    },
    // Tarjeta de mapa — preview de ultima posicion, navega a la pantalla de mapa.
    mapCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.spacing['4'],
      borderWidth: 1,
      borderColor: semantic.border.metal,
      backgroundColor: cardBg,
      padding: tokens.spacing['5'],
      overflow: 'hidden',
    },
    mapGlyphBox: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: semantic.border.metal,
      backgroundColor: semantic.bg.inset,
    },
    mapGlyph: {
      color: semantic.accent.warning,
      fontSize: 20,
      textShadowColor: semantic.glow.text,
      textShadowRadius: 6,
    },
    mapBody: {
      flex: 1,
      gap: tokens.spacing['1'],
    },
    // Sin label: la direccion es el titular de la tarjeta.
    mapValue: {
      color: semantic.fg.primary,
      fontFamily: fontFamily.ui.regular,
      fontSize: 14,
    },
    mapDetail: {
      color: semantic.fg.muted,
      fontFamily: fontFamily.ui.regular,
      fontSize: 11,
      letterSpacing: 0.5,
      // En la fila footer cede sitio al boton de fix si la pantalla es estrecha.
      flexShrink: 1,
    },
    mapArrow: {
      color: semantic.accent.warning,
      fontFamily: fontFamily.ui.medium,
      fontSize: 16,
    },
    // Ultima posicion + "Actualizar ubicacion" comparten fila: la tarjeta no
    // apila lineas sueltas. El boton pide un LOCATE_NOW real — es una accion.
    mapFooterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: tokens.spacing['3'],
      marginTop: tokens.spacing['1'],
    },
    locateRow: {
      flexShrink: 1,
      paddingHorizontal: tokens.spacing['3'],
      paddingVertical: tokens.spacing['1'],
      borderWidth: 1,
      borderColor: semantic.border.metal,
      backgroundColor: semantic.bg.inset,
    },
    locateText: {
      color: semantic.accent.warning,
      fontFamily: fontFamily.ui.medium,
      fontSize: 11,
      letterSpacing: 2,
      textTransform: 'uppercase',
    },
    locateTextMuted: {
      color: semantic.fg.muted,
    },
    locateTextAlert: {
      color: semantic.accent.red,
    },
    // Fila vacia dentro del panel de eventos (reserva altura, sin pop-in).
    emptyEventsRow: {
      paddingHorizontal: tokens.spacing['4'],
      paddingVertical: tokens.spacing['5'],
      alignItems: 'center',
    },
    emptyEventsText: {
      color: semantic.fg.muted,
      fontFamily: fontFamily.ui.regular,
      fontSize: 12,
      letterSpacing: 1,
    },
    // Eventos recientes — panel con filas uniformes.
    sectionLabel: {
      color: semantic.fg.muted,
      fontFamily: fontFamily.ui.medium,
      fontSize: 11,
      letterSpacing: 3,
      textTransform: 'uppercase',
      marginBottom: tokens.spacing['3'],
    },
    recentPanel: {
      borderWidth: 1,
      borderColor: semantic.border.metal,
      backgroundColor: cardBg,
      overflow: 'hidden',
    },
    // Cabecera dentro del panel de eventos.
    panelHeader: {
      paddingHorizontal: tokens.spacing['4'],
      paddingVertical: tokens.spacing['3'],
      borderBottomWidth: 1,
      borderBottomColor: semantic.border.subtle,
      backgroundColor: semantic.bg.inset,
    },
    panelHeaderText: {
      color: semantic.fg.muted,
      fontFamily: fontFamily.ui.medium,
      fontSize: 11,
      letterSpacing: 3,
      textTransform: 'uppercase',
    },
    eventRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.spacing['3'],
      paddingHorizontal: tokens.spacing['4'],
      paddingVertical: tokens.spacing['3'],
    },
    eventRowDivider: {
      borderTopWidth: 1,
      borderTopColor: semantic.border.subtle,
    },
    glyphBox: {
      width: 26,
      height: 26,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: semantic.border.metal,
      backgroundColor: semantic.bg.inset,
    },
    glyphBoxAlert: {
      borderColor: semantic.border.danger,
    },
    eventGlyph: {
      color: semantic.accent.warning,
      fontFamily: fontFamily.ui.regular,
      fontSize: 13,
    },
    eventGlyphAlert: {
      color: semantic.accent.red,
    },
    eventLabel: {
      color: semantic.fg.secondary,
      fontFamily: fontFamily.ui.regular,
      fontSize: 13,
      flex: 1,
    },
    eventLabelAlert: {
      color: semantic.accent.red,
    },
    eventTime: {
      color: semantic.fg.muted,
      fontFamily: fontFamily.ui.regular,
      fontSize: 12,
    },
    // Fila-enlace "ver historial" al pie del panel.
    eventsLinkRow: {
      alignItems: 'flex-end',
      paddingHorizontal: tokens.spacing['4'],
      paddingVertical: tokens.spacing['3'],
      borderTopWidth: 1,
      borderTopColor: semantic.border.subtle,
      backgroundColor: semantic.bg.inset,
    },
    sectionLink: {
      color: semantic.accent.warning,
      fontFamily: fontFamily.ui.medium,
      fontSize: 12,
      letterSpacing: 1,
    },
    // CTA anclado: siempre visible, no scrollea, no se mueve al cambiar estado.
    footer: {
      paddingHorizontal: tokens.spacing['6'],
      paddingTop: tokens.spacing['5'],
      backgroundColor: 'transparent',
    },
  });
}

export type DashboardStyles = ReturnType<typeof createStyles>;
