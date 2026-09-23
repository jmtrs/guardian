import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HUDButton } from '@/ui/composites/HUDButton';
import { Reveal } from '@/ui/composites/Reveal';
import { ScreenGrid } from '@/ui/composites/ScreenGrid';
import { useUITheme, withAlpha } from '@/ui/theme';
import { createInfoSheetStyles } from './InfoSheet.styles';

const SHEET_OFFSCREEN_Y = 640;
const CLOSE_DISTANCE = 96;
const CLOSE_VELOCITY = 700;
const OPEN_SPRING = { damping: 22, stiffness: 240, mass: 0.8 } as const;
const RETURN_SPRING = { damping: 24, stiffness: 280, mass: 0.75 } as const;

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
// Modal nativo + gesto propio. @gorhom/bottom-sheet pierde frames de contenido
// durante un pan-down lento en Android/Fabric, incluso fuera de su portal. Este
// panel simple no necesita su motor de snap-points: una sola posicion abierta y
// un cierre vertical mantienen el contenido en el mismo arbol durante el gesto.
// API imperativa: `const r = useRef<InfoSheetHandle>(null)` + `r.current?.present()`.
export const InfoSheet = forwardRef<InfoSheetHandle, InfoSheetProps>(function InfoSheet(
  { glyph, title, items, closeLabel },
  ref,
) {
  const theme = useUITheme();
  const styles = useMemo(() => createInfoSheetStyles(theme), [theme]);
  const { semantic } = theme;
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const translateY = useSharedValue(SHEET_OFFSCREEN_Y);

  const finishClose = useCallback(() => {
    setOpen(false);
  }, []);

  const close = useCallback(() => {
    translateY.value = withTiming(
      SHEET_OFFSCREEN_Y,
      { duration: 220, easing: Easing.out(Easing.cubic) },
      (finished?: boolean) => {
        if (finished) runOnJS(finishClose)();
      },
    );
  }, [finishClose, translateY]);

  const present = useCallback(() => {
    if (open) {
      translateY.value = withSpring(0, OPEN_SPRING);
      return;
    }
    translateY.value = SHEET_OFFSCREEN_Y;
    setOpen(true);
  }, [open, translateY]);

  useImperativeHandle(
    ref,
    () => ({
      present,
      dismiss: close,
    }),
    [close, present],
  );

  useEffect(() => {
    if (open) translateY.value = withSpring(0, OPEN_SPRING);
  }, [open, translateY]);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(6)
        .failOffsetX([-24, 24])
        .onUpdate((event) => {
          translateY.value = Math.max(0, event.translationY);
        })
        .onEnd((event) => {
          if (translateY.value >= CLOSE_DISTANCE || event.velocityY >= CLOSE_VELOCITY) {
            translateY.value = withTiming(
              SHEET_OFFSCREEN_Y,
              { duration: 180, easing: Easing.out(Easing.cubic) },
              (finished?: boolean) => {
                if (finished) runOnJS(finishClose)();
              },
            );
            return;
          }
          translateY.value = withSpring(0, RETURN_SPRING);
        })
        .onFinalize((_event, success) => {
          if (!success) translateY.value = withSpring(0, RETURN_SPRING);
        }),
    [finishClose, translateY],
  );

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateY.value, [0, SHEET_OFFSCREEN_Y], [1, 0], Extrapolation.CLAMP),
  }));

  if (!open) return null;

  return (
    <Modal
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={close}
    >
      <GestureHandlerRootView style={styles.modalRoot}>
        <Animated.View
          pointerEvents="box-none"
          style={[StyleSheet.absoluteFill, backdropAnimatedStyle]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={closeLabel}
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: withAlpha(semantic.bg.canvas, 0.5) },
            ]}
            onPress={close}
          />
        </Animated.View>
        <GestureDetector gesture={panGesture}>
          <Animated.View
            accessibilityViewIsModal
            style={[
              styles.sheet,
              {
                paddingBottom: insets.bottom,
                backgroundColor: withAlpha(semantic.bg.surface, 0.88),
              },
              sheetAnimatedStyle,
            ]}
          >
            <View style={styles.handle}>
              <View
                style={[styles.handleIndicator, { backgroundColor: semantic.accent.warning }]}
              />
            </View>
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
                <HUDButton label={closeLabel} onPress={close} />
              </Reveal>
            </View>
          </Animated.View>
        </GestureDetector>
        <ScreenGrid />
      </GestureHandlerRootView>
    </Modal>
  );
});
