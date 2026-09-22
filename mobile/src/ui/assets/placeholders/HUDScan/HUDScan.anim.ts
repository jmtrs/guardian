import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';

/**
 * Duration of one complete scan sweep in milliseconds.
 * @defaultValue 2800
 */
const SCAN_DURATION_MS = 2800;

/**
 * Delay between the main scan and the echo line in milliseconds.
 * @defaultValue 480
 *
 * The echo line always trails the main scan by this fixed amount,
 * creating a consistent separation regardless of animation progress.
 */
const ECHO_DELAY_MS = 480;

/**
 * Hook that drives two vertical sweep animations for the HUDScan component.
 *
 * Returns animated values for both the main scan line and a dimmer echo line
 * that always trails behind by `ECHO_DELAY_MS`.
 *
 * ## Animation Pattern
 *
 * This hook uses the **recursive pattern** for infinite loops instead of
 * `Animated.loop`, which has a known bug in Expo that stops the loop after
 * the first iteration.
 *
 * @param containerHeight - measured height of the HUDScan root.
 *   Animations are a no-op until this value is > 0.
 *
 * @returns Object with:
 *   - `scanTranslateY`: Animated value for main sweep (range: -TRAIL_H to containerHeight)
 *   - `echoTranslateY`: Animated value for echo line (range: -4 to containerHeight)
 *
 * @example
 * ```ts
 * const { scanTranslateY, echoTranslateY } = useHUDScanAnim(containerHeight);
 * ```
 *
 * @see Pattern: Recursive animation loop with cleanup flag
 */
export function useHUDScanAnim(containerHeight: number) {
  const scanY = useRef(new Animated.Value(0)).current;
  const echoY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (containerHeight === 0) return;

    let stopped = false;
    let echoTimer: ReturnType<typeof setTimeout> | null = null;

    function runMain() {
      if (stopped) return;
      scanY.setValue(0);
      Animated.timing(scanY, {
        toValue: 1,
        duration: SCAN_DURATION_MS,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && !stopped) runMain();
      });
    }

    function runEcho() {
      if (stopped) return;
      echoY.setValue(0);
      Animated.timing(echoY, {
        toValue: 1,
        duration: SCAN_DURATION_MS,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && !stopped) runEcho();
      });
    }

    runMain();
    // Same duration as main — the fixed delay keeps the gap constant forever.
    echoTimer = setTimeout(() => { if (!stopped) runEcho(); }, ECHO_DELAY_MS);

    return () => {
      stopped = true;
      if (echoTimer) clearTimeout(echoTimer);
      scanY.stopAnimation();
      echoY.stopAnimation();
    };
  }, [containerHeight, scanY, echoY]);

  const TRAIL_H = 110;
  const scanTranslateY = scanY.interpolate({
    inputRange: [0, 1],
    outputRange: [-TRAIL_H, containerHeight],
  });
  const echoTranslateY = echoY.interpolate({
    inputRange: [0, 1],
    outputRange: [-4, containerHeight],
  });

  return { scanTranslateY, echoTranslateY };
}
