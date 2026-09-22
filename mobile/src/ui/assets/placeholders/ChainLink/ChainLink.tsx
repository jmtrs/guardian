import { Fragment, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { View } from 'react-native';

import { darkTheme } from '@/ui/theme';
import { getPlaceholderOpacity } from '../placeholderUtils';
import type { ChainLinkProps } from './ChainLink.types';
import { styles, DEFAULTS } from './ChainLink.styles';

/**
 * Chain-link fence texture — two grids of diagonal lines at +45° and -45°
 * covering the parent with `absoluteFillObject`.
 *
 * Typical use: background surface texture inside cards or panels.
 *
 * ## Implementation Details
 *
 * - Calculates the number of lines dynamically based on parent dimensions
 * - Uses `absoluteFillObject` to cover the entire parent container
 * - The `spacing` and `thickness` props are shared with `MetalPlate`
 * - When `direction: 'both'`, creates the classic chain-link metal mesh pattern
 *
 * ## Visual Characteristics
 *
 * - Color: `darkTheme.tokens.color['steel.700']` (steel grey)
 * - Opacity: controlled by `intensity` prop (low=14%, medium=26%, high=42%)
 * - Pattern: Two perpendicular diagonal grids creating a woven mesh effect
 *
 * @example
 * ```tsx
 * // Default interlocked grid pattern
 * <ChainLink intensity="medium" />
 *
 * // Forward diagonal only (softer texture)
 * <ChainLink intensity="low" direction="forward" />
 *
 * // Thicker, more widely spaced lines
 * <ChainLink spacing={24} thickness={2} />
 * ```
 */
export function ChainLink({
  style,
  intensity = 'low',
  direction = 'both',
  spacing = DEFAULTS.spacing,
  thickness = DEFAULTS.thickness,
}: ChainLinkProps) {
  const color = darkTheme.tokens.color['steel.700'];
  const [size, setSize] = useState({ width: 0, height: 0 });

  function onLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  }

  const lineLength = Math.max(size.width, size.height) * Math.SQRT2;
  const lineLeft = size.width / 2 - lineLength / 2;
  const lineCount = size.height > 0 && size.width > 0
    ? Math.ceil((size.height + size.width + spacing * 2) / spacing)
    : 0;
  const lineOffset = size.width / 2 + spacing;

  const forward  = direction === 'forward'  || direction === 'both';
  const backward = direction === 'backward' || direction === 'both';

  const lineBase = {
    left: lineLeft,
    width: lineLength,
    height: thickness,
    backgroundColor: color,
  };

  return (
    <View
      pointerEvents="none"
      onLayout={onLayout}
      style={[styles.root, { opacity: getPlaceholderOpacity(intensity) }, style]}
    >
      {size.width > 0 &&
        Array.from({ length: lineCount }, (_, i) => {
          const top = i * spacing - lineOffset;
          return (
            <Fragment key={i}>
              {forward && (
                <View style={[styles.line, lineBase, { top, transform: [{ rotate: '45deg' }] }]} />
              )}
              {backward && (
                <View style={[styles.line, lineBase, { top, transform: [{ rotate: '-45deg' }] }]} />
              )}
            </Fragment>
          );
        })}
    </View>
  );
}
