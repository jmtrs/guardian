import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
} from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import { BlurView } from 'expo-blur';

import { HUDButton } from '@/ui/composites/HUDButton';
import { Reveal } from '@/ui/composites/Reveal';
import { useUITheme, withAlpha } from '@/ui/theme';
import { createInfoSheetStyles } from './InfoSheet.styles';

export type InfoSheetItem = {
  /** Glifo HUD a la izquierda de la fila (misma familia que eventos/estados). */
  glyph: string;
  text: string;
};

export type InfoSheetHandle = {
  present: () => void;
  dismiss: () => void;
};

type InfoSheetProps = {
  glyph: string;
  title: string;
  items: InfoSheetItem[];
  closeLabel: string;
};

// Panel explicativo reutilizable: bottom sheet translucido y filas glifo+texto
// que entran escalonadas (Reveal). Para avisos que no caben en una linea pero
// no merecen pantalla propia (privacidad, ayuda...).
//
// Usa el BottomSheet NO modal: el blur de iOS solo ve el contenido de su
// propia ventana, y un BottomSheetModal abriria en ventana aparte. En Android
// no hay blur (expo-blur exige blurTarget y cicla el RenderEffect con la
// vista que lo contiene): superficie casi opaca.
// API imperativa: `const r = useRef<InfoSheetHandle>(null)` + `r.current?.present()`.
export const InfoSheet = forwardRef<InfoSheetHandle, InfoSheetProps>(function InfoSheet(
  { glyph, title, items, closeLabel },
  ref,
) {
  const theme = useUITheme();
  const styles = useMemo(() => createInfoSheetStyles(theme), [theme]);
  const { semantic } = theme;
  const [open, setOpen] = useState(false);
  const sheet = useRef<ComponentRef<typeof BottomSheet>>(null);

  useImperativeHandle(
    ref,
    () => ({
      present: () => setOpen(true),
      dismiss: () => sheet.current?.close(),
    }),
    [],
  );

  const close = useCallback(() => setOpen(false), []);

  // Fondo del sheet: iOS vidrio esmerilado (blur nativo + superficie al 45%);
  // Android casi opaco (blur no viable, ver comentario del componente).
  const sheetBackground = useCallback(
    ({ style }: { style?: StyleProp<ViewStyle> }) => {
      const surfaceAlpha = Platform.OS === 'ios' ? 0.45 : 0.9;
      const background =
        Platform.OS === 'ios' ? (
          <BlurView intensity={28} tint="default" />
        ) : (
          <View />
        );
      return (
        <View style={[StyleSheet.absoluteFill, style]}>
          {background}
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: withAlpha(semantic.bg.surface, surfaceAlpha) },
            ]}
          />
        </View>
      );
    },
    [semantic.bg.surface],
  );

  if (!open) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Atenua el contenido trasero y cierra al pulsar fuera. */}
      <Pressable
        style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(semantic.bg.canvas, 0.5) }]}
        onPress={close}
      />
      <BottomSheet
        ref={sheet}
        // Altura segun el contenido: BottomSheetView mide y fija el snap.
        enableDynamicSizing
        maxDynamicContentSize={560}
        // Fuera del modal el swipe-down NO cierra por defecto (default false):
        // hay que activarlo o el sheet rebota sin cerrarse.
        enablePanDownToClose
        backgroundComponent={sheetBackground}
        handleIndicatorStyle={{ backgroundColor: semantic.accent.warning }}
        onClose={close}
      >
        <BottomSheetView>
          <View style={styles.accentBar} />
          <View style={styles.content}>
            <Reveal distance={10}>
              <View style={styles.header}>
                <Text style={styles.glyph}>{glyph}</Text>
                <Text style={styles.title}>{title}</Text>
              </View>
            </Reveal>
            <View style={styles.rows}>
              {items.map((item, i) => (
                <Reveal key={item.text} delay={90 * (i + 1)} distance={12}>
                  <View style={styles.row}>
                    <Text style={styles.rowGlyph}>{item.glyph}</Text>
                    <Text style={styles.rowText}>{item.text}</Text>
                  </View>
                </Reveal>
              ))}
            </View>
            <Reveal delay={90 * (items.length + 1)} distance={8}>
              <HUDButton label={closeLabel} onPress={() => sheet.current?.close()} />
            </Reveal>
          </View>
        </BottomSheetView>
      </BottomSheet>
    </View>
  );
});
