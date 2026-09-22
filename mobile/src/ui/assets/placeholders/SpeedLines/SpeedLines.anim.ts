import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';

/**
 * Base duration for line animations in milliseconds.
 * Each line adds its own `durationOffset` to this base.
 * @defaultValue 900
 */
const BASE_DURATION_MS = 900;

/**
 * Distance each line scrolls left in one complete loop.
 * @defaultValue 260
 */
export const LINE_PERIOD = 260;

/**
 * Configuration for a single motion-blur line.
 */
export type SpeedLineConfig = {
  translateX: Animated.AnimatedInterpolation<number>;
  top: number;
  width: number;
  opacity: number;
};

/**
 * Line definitions for the speed-blur effect.
 * Each entry defines:
 * - `top`: vertical position from top (px)
 * - `width`: line width (px)
 * - `opacity`: line opacity (0.0 - 1.0)
 * - `durationOffset`: additional milliseconds added to base duration
 *
 * The varied properties create a natural, non-uniform motion blur effect.
 */
const LINE_DEFS = [
  { top: 4,  width: 90,  opacity: 0.9, durationOffset: 0   },
  { top: 10, width: 130, opacity: 0.7, durationOffset: 80  },
  { top: 18, width: 60,  opacity: 0.5, durationOffset: 140 },
  { top: 26, width: 110, opacity: 0.8, durationOffset: 30  },
  { top: 34, width: 75,  opacity: 0.6, durationOffset: 200 },
  { top: 42, width: 140, opacity: 0.9, durationOffset: 60  },
  { top: 50, width: 50,  opacity: 0.4, durationOffset: 170 },
];

/**
 * Hook that animates 7 horizontal lines with slightly different speeds and widths,
 * each scrolling left by `LINE_PERIOD` on loop.
 *
 * Returns an array of per-line configuration objects ready to spread onto
 * Animated.View style props.
 *
 * ## Animation Pattern
 *
 * This hook uses the **recursive pattern** for infinite loops instead of
 * `Animated.loop`, which has a known bug in Expo that stops the loop after
 * the first iteration.
 *
 * Each line has its own `Animated.Value` with a unique duration based on
 * `BASE_DURATION_MS + durationOffset`, creating natural-looking variation.
 *
 * @returns Array of `SpeedLineConfig` objects, one per line (7 total).
 *   Each config contains:
 *   - `translateX`: Animated value for horizontal scrolling
 *   - `top`: Vertical position in pixels
 *   - `width`: Line width in pixels
 *   - `opacity`: Line opacity (0.0 - 1.0)
 *
 * @example
 * ```tsx
 * const lines = useSpeedLinesAnim();
 *
 * // Use in your component:
 * // {lines.map((line, i) => (
 * //   <Animated.View
 * //     key={i}
 * //     style={{
 * //       top: line.top,
 * //       width: line.width,
 * //       opacity: line.opacity,
 * //       transform: [{ translateX: line.translateX }],
 * //     }}
 * //   />
 * // ))}
 * ```
 */
export function useSpeedLinesAnim(): SpeedLineConfig[] {
  const anims = useRef(LINE_DEFS.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    let stopped = false;

    const runners = anims.map((anim, i) => {
      const duration = BASE_DURATION_MS + LINE_DEFS[i].durationOffset;

      function run() {
        if (stopped) return;
        anim.setValue(0);
        Animated.timing(anim, {
          toValue: 1,
          duration,
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished && !stopped) run();
        });
      }

      run();
      return anim;
    });

    return () => {
      stopped = true;
      runners.forEach((anim) => anim.stopAnimation());
    };
  }, [anims]);

  return anims.map((anim, i) => ({
    translateX: anim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, -LINE_PERIOD],
    }),
    top: LINE_DEFS[i].top,
    width: LINE_DEFS[i].width,
    opacity: LINE_DEFS[i].opacity,
  }));
}
