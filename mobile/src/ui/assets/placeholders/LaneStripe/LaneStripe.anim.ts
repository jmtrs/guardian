import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';

/**
 * Distance between stripes in pixels.
 * @defaultValue 28
 *
 * This is also the amount the track translates left in one complete loop.
 */
export const STRIPE_PERIOD = 28;

/**
 * Duration of one complete scroll cycle in milliseconds.
 * @defaultValue 1200
 */
const SCROLL_DURATION_MS = 1200;

/**
 * Hook that scrolls the hazard-tape stripe track left by one `STRIPE_PERIOD` on loop,
 * producing a seamless scrolling hazard-tape effect.
 *
 * ## Animation Pattern
 *
 * This hook uses the **recursive pattern** for infinite loops instead of
 * `Animated.loop`, which has a known bug in Expo that stops the loop after
 * the first iteration.
 *
 * @returns Object with:
 *   - `translateX`: Animated value ranging from 0 to -STRIPE_PERIOD, then looping
 *
 * @example
 * ```tsx
 * const { translateX } = useLaneStripeAnim();
 *
 * // Use in your component:
 * // <Animated.View style={{ transform: [{ translateX }] }} />
 * ```
 */
export function useLaneStripeAnim() {
  const scrollX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let stopped = false;

    function run() {
      if (stopped) return;
      scrollX.setValue(0);
      Animated.timing(scrollX, {
        toValue: 1,
        duration: SCROLL_DURATION_MS,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && !stopped) run();
      });
    }

    run();
    return () => {
      stopped = true;
      scrollX.stopAnimation();
    };
  }, [scrollX]);

  const translateX = scrollX.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -STRIPE_PERIOD],
  });

  return { translateX };
}
