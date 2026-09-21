import { useState } from 'react';
import { Animated, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';

import type { PlaceholderProps } from '../Placeholder.types';
import { getPlaceholderOpacity } from '../placeholderUtils';
import { useHUDScanAnim } from './HUDScan.anim';
import { styles, TRAIL_H } from './HUDScan.styles';

/**
 * Radar-style scanner — a multi-layer amber line that sweeps from top to bottom
 * on a continuous loop, with a fading trail and a dimmer echo line behind it.
 *
 * Covers the parent with `absoluteFillObject`; measures its own height so the
 * sweep range is always exact regardless of container size.
 *
 * ## Implementation Details
 *
 * The HUDScan creates a realistic radar sweep effect using:
 *
 * ### Trail Layers (from far to near)
 * - `trailFar`: 60px height, bottom 50px, opacity 0.04 (faint distant trail)
 * - `trailMid`: 30px height, bottom 20px, opacity 0.09 (medium trail)
 * - `trailNear`: 12px height, bottom 8px, opacity 0.18 (near trail)
 * - `scanLine`: 2px height, bottom 6px, opacity 0.75 (bright leading edge)
 * - `afterGlow`: 5px height, bottom 1px, opacity 0.08 (faint continuation)
 *
 * ### Tick Markers
 * - `tickLeft`: 6x2px at left edge, bottom 6px
 * - `tickRight`: 6x2px at right edge, bottom 6px
 *
 * ### Echo Line
 * - `echoLine`: 1px height, 8px from each side, opacity 0.2
 * - Always trails the main scan by 480ms
 *
 * ### Animation
 * - Duration: 2800ms per sweep
 * - Uses `useNativeDriver: true` for transform animations
 * - Pattern: Recursive animation loop with cleanup flag
 *
 * ## Visual Characteristics
 *
 * - Color: `darkTheme.semantic.accent.warning` (amber warning yellow)
 * - Opacity: controlled by `intensity` prop (low=14%, medium=26%, high=42%)
 * - Height: dynamic (measured from parent container)
 * - Loop: continuous, never completes
 *
 * @example
 * ```tsx
 * // Full-height HUD scanner
 * <View style={{ height: 300 }}>
 *   <HUDScan intensity="high" />
 * </View>
 *
 * // Subtle scanner overlay
 * <HUDScan intensity="low" />
 * ```
 */
export function HUDScan({ style, intensity = 'medium' }: PlaceholderProps) {
  const [containerHeight, setContainerHeight] = useState(0);

  function onLayout(e: LayoutChangeEvent) {
    const { height } = e.nativeEvent.layout;
    if (height !== containerHeight) setContainerHeight(height);
  }

  const { scanTranslateY, echoTranslateY } = useHUDScanAnim(containerHeight);

  return (
    <View
      pointerEvents="none"
      onLayout={onLayout}
      style={[styles.root, { opacity: getPlaceholderOpacity(intensity) }, style]}
    >
      {containerHeight > 0 && (
        <>
          <Animated.View
            style={[
              { position: 'absolute', left: 0, right: 0, height: TRAIL_H, top: 0 },
              { transform: [{ translateY: scanTranslateY }] },
            ]}
          >
            <View style={styles.trailFar} />
            <View style={styles.trailMid} />
            <View style={styles.trailNear} />
            <View style={styles.scanLine} />
            <View style={styles.afterGlow} />
            <View style={styles.tickLeft} />
            <View style={styles.tickRight} />
          </Animated.View>

          <Animated.View style={[styles.echoLine, { transform: [{ translateY: echoTranslateY }] }]} />
        </>
      )}
    </View>
  );
}
