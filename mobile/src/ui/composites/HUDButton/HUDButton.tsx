import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, Text, View } from 'react-native';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';

import { useHUDButtonAnim, WRAP_PAD } from './HUDButton.anim';
import { createHUDButtonStyles, getVariantPalette } from './HUDButton.styles';
import type { HUDButtonVariant } from './HUDButton.types';
import { useUITheme } from '@/ui/theme';

type HUDButtonProps = {
  label: string;
  onPress: () => void;
  variant?: HUDButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  /** Override the label text style (e.g. smaller size for secondary buttons). */
  labelStyle?: StyleProp<TextStyle>;
};

// Primary action button with animated corner brackets, scan line, and squeeze on press.
// Ported from the BasketBlackTop HUD foundation — use it for every main action.
export function HUDButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  testID,
  style,
  labelStyle,
}: HUDButtonProps) {
  const theme = useUITheme();
  const s = useMemo(() => createHUDButtonStyles(theme), [theme]);
  const palette = useMemo(() => getVariantPalette(variant, theme), [variant, theme]);

  const [width, setWidth] = useState(0);
  const enabled = !disabled && !loading;
  const { layoutAnim, scaleAnim, scanAnim, onPressIn, onPressOut } = useHUDButtonAnim(enabled);

  const cornerPos = useMemo(
    () =>
      layoutAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [WRAP_PAD - 5, WRAP_PAD],
      }),
    [layoutAnim],
  );
  const cornerW = useMemo(
    () => layoutAnim.interpolate({ inputRange: [0, 1], outputRange: [12, width / 2 || 12] }),
    [layoutAnim, width],
  );
  const cornerH = useMemo(
    () => layoutAnim.interpolate({ inputRange: [0, 1], outputRange: [8, s.button.height / 2] }),
    [layoutAnim, s.button.height],
  );
  const bgColor = useMemo(
    () => layoutAnim.interpolate({ inputRange: [0, 1], outputRange: palette.bg }),
    [layoutAnim, palette],
  );
  const cornerColor = useMemo(
    () => layoutAnim.interpolate({ inputRange: [0, 1], outputRange: palette.corner }),
    [layoutAnim, palette],
  );
  const cornerShared = useMemo(
    () => ({ width: cornerW, height: cornerH, borderColor: cornerColor }),
    [cornerW, cornerH, cornerColor],
  );
  const scanRange = useMemo(() => ({ from: -width, to: width + 60 }), [width]);

  const handleLayout = (e: { nativeEvent: { layout: { width: number } } }) => {
    setWidth(e.nativeEvent.layout.width);
  };

  return (
    <Pressable
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      onPress={onPress}
      disabled={!enabled}
      testID={testID}
      style={[s.pressable, style]}
    >
      {/* Scale wrapper — native driver, separate from layout views below */}
      <Animated.View style={[{ transform: [{ scale: scaleAnim }] }, !enabled && s.disabled]}>
        <View style={s.wrapper} onLayout={handleLayout}>
          {/* Corner brackets — absolutely positioned inside the wrapper */}
          <Animated.View
            style={[s.corner, s.cornerLT, cornerShared, { top: cornerPos, left: cornerPos }]}
          />
          <Animated.View
            style={[s.corner, s.cornerLB, cornerShared, { bottom: cornerPos, left: cornerPos }]}
          />
          <Animated.View
            style={[s.corner, s.cornerRT, cornerShared, { top: cornerPos, right: cornerPos }]}
          />
          <Animated.View
            style={[s.corner, s.cornerRB, cornerShared, { bottom: cornerPos, right: cornerPos }]}
          />
          {/* Button body — overflow:hidden clips the scan line */}
          <Animated.View style={[s.button, { backgroundColor: bgColor }]}>
            <Animated.View
              style={[
                s.scanLine,
                { backgroundColor: palette.scan },
                {
                  transform: [
                    { translateX: scanAnim.interpolate({ inputRange: [0, 1], outputRange: [scanRange.from, scanRange.to] }) },
                    { skewX: '-18deg' },
                  ],
                },
              ]}
            />
            {loading ? (
              <ActivityIndicator size="small" color={palette.label} />
            ) : (
              <Text style={[s.label, { color: palette.label }, labelStyle]}>{label}</Text>
            )}
          </Animated.View>
        </View>
      </Animated.View>
    </Pressable>
  );
}
