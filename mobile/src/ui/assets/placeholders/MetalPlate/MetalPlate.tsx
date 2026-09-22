import { View } from 'react-native';

import { ChainLink } from '../ChainLink/ChainLink';
import { HUDScan } from '../HUDScan/HUDScan';
import { styles } from './MetalPlate.styles';
import type { MetalPlateProps } from './MetalPlate.types';

/**
 * Textured metal panel — a container that layers ChainLink and HUDScan behind
 * its children. Both texture layers are configurable via props.
 *
 * ## Implementation Details
 *
 * MetalPlate is a composite placeholder that combines:
 * 1. **ChainLink** (background layer) — metal mesh texture
 * 2. **HUDScan** (middle layer) — radar sweep animation
 * 3. **Children** (foreground) — your content
 *
 * The component applies a metal border and panel background to contain
 * the textures and content.
 *
 * ## Layer Order (bottom to top)
 *
 * ```
 * MetalPlate (border, background)
 * ├── ChainLink (background texture)
 * │   └── intensity, direction, spacing, thickness
 * ├── HUDScan (animation overlay)
 * │   └── intensity (defaults to plate intensity)
 * └── children (content layer)
 * ```
 *
 * ## Visual Characteristics
 *
 * - Border: `darkTheme.tokens.border.width.thin` with `darkTheme.semantic.border.metal`
 * - Background: `darkTheme.semantic.surface.panel` (carbon panel)
 * - ChainLink: defaults to `intensity='low'`, `direction='both'`
 * - HUDScan: defaults to plate's `intensity`
 *
 * @example
 * ```tsx
 * // Default: low intensity, both directions
 * <MetalPlate>
 *   <Text>Content with both textures</Text>
 * </MetalPlate>
 *
 * // Custom chain pattern with stronger scan
 * <MetalPlate
 *   intensity="medium"
 *   chainDirection="forward"
 *   chainSpacing={12}
 *   scanIntensity="high"
 * >
 *   <Text>Forward diagonal lines with bright scan</Text>
 * </MetalPlate>
 *
 * // Strong metal texture with backward chain
 * <MetalPlate
 *   intensity="low"
 *   chainDirection="backward"
 *   chainThickness={2}
 * >
 *   <Text>Thick backward lines</Text>
 * </MetalPlate>
 * ```
 */
export function MetalPlate({
  children,
  style,
  intensity = 'low',
  chainDirection = 'both',
  chainSpacing,
  chainThickness,
  scanIntensity,
}: MetalPlateProps) {
  return (
    <View style={[styles.root, style]}>
      <ChainLink
        intensity={intensity}
        direction={chainDirection}
        spacing={chainSpacing}
        thickness={chainThickness}
      />
      <HUDScan intensity={scanIntensity ?? intensity} />
      {children}
    </View>
  );
}
