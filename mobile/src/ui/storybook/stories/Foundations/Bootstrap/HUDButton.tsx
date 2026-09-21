import { useMemo } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';

import { useUITheme } from '@/ui/theme';
import { useHUDButtonAnim, BTN_W, BTN_H, WRAP_PAD } from './HUDButton.anim';
import { createHUDButtonStyles } from './HUDButton.styles';

// OK button with animated corner brackets, scan line, and squeeze on press.
export function HUDButton() {
  const theme = useUITheme();
  const s = useMemo(() => createHUDButtonStyles(theme), [theme]);
  const { layoutAnim, scaleAnim, scanAnim, onPressIn, onPressOut } = useHUDButtonAnim();

  const cornerPos = useMemo(
    () => layoutAnim.interpolate({ inputRange: [0, 1], outputRange: [WRAP_PAD - 5, WRAP_PAD] }),
    [layoutAnim],
  );
  const cornerW = useMemo(
    () => layoutAnim.interpolate({ inputRange: [0, 1], outputRange: [12, BTN_W / 2] }),
    [layoutAnim],
  );
  const cornerH = useMemo(
    () => layoutAnim.interpolate({ inputRange: [0, 1], outputRange: [8, BTN_H / 2] }),
    [layoutAnim],
  );
  const bgColor = useMemo(
    () => layoutAnim.interpolate({ inputRange: [0, 1], outputRange: ['#242923', '#2E3229'] }),
    [layoutAnim],
  );
  const cornerColor = useMemo(
    () => layoutAnim.interpolate({ inputRange: [0, 1], outputRange: ['#D9A51D', '#F0C232'] }),
    [layoutAnim],
  );
  const cornerShared = useMemo(
    () => ({ width: cornerW, height: cornerH, borderColor: cornerColor }),
    [cornerW, cornerH, cornerColor],
  );

  return (
    <Pressable onPressIn={onPressIn} onPressOut={onPressOut} style={s.pressable}>
      {/* Scale wrapper — native driver, separate from layout views below */}
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <View style={s.wrapper}>
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
              style={[s.scanLine, { transform: [{ translateX: scanAnim }, { skewX: '-18deg' }] }]}
            />
            <Text style={s.okText}>OK</Text>
          </Animated.View>
        </View>
      </Animated.View>
    </Pressable>
  );
}
