import { useCallback, useEffect, useRef } from 'react';
import { Animated } from 'react-native';

export const BTN_W = 132;
export const BTN_H = 26;
export const WRAP_PAD = 8;

// Minimum time the pressed state stays visible — guarantees a quick tap still shows the animation.
const MIN_PRESS_MS = 320;

export function useHUDButtonAnim() {
  const layoutAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const scanAnim = useRef(new Animated.Value(-BTN_W)).current;
  const pressInAt = useRef(0);
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear any pending release timer on unmount
  useEffect(() => () => {
    if (releaseTimer.current) clearTimeout(releaseTimer.current);
  }, []);

  const onPressIn = useCallback(() => {
    if (releaseTimer.current) {
      clearTimeout(releaseTimer.current);
      releaseTimer.current = null;
    }
    pressInAt.current = Date.now();

    // Stop any in-progress animations before starting fresh — prevents the
    // "sometimes doesn't fire" issue when tapping rapidly.
    layoutAnim.stopAnimation();
    scaleAnim.stopAnimation();
    scaleAnim.setValue(1);
    scanAnim.stopAnimation();
    scanAnim.setValue(-BTN_W);

    Animated.parallel([
      Animated.spring(layoutAnim, {
        toValue: 1,
        useNativeDriver: false,
        tension: 300,
        friction: 20,
      }),
      // Squeeze punch — self-contained, always ends at 1 regardless of press length
      Animated.sequence([
        Animated.timing(scaleAnim, { toValue: 0.94, duration: 70, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 1.02, duration: 80, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 1, duration: 60, useNativeDriver: true }),
      ]),
      Animated.timing(scanAnim, {
        toValue: BTN_W + 60,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [layoutAnim, scaleAnim, scanAnim]);

  const onPressOut = useCallback(() => {
    const elapsed = Date.now() - pressInAt.current;
    const delay = Math.max(0, MIN_PRESS_MS - elapsed);
    releaseTimer.current = setTimeout(() => {
      layoutAnim.stopAnimation();
      Animated.spring(layoutAnim, {
        toValue: 0,
        useNativeDriver: false,
        tension: 300,
        friction: 20,
      }).start();
    }, delay);
  }, [layoutAnim]);

  return { layoutAnim, scaleAnim, scanAnim, onPressIn, onPressOut };
}
