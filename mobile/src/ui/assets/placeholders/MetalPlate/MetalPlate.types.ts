import type { ReactNode } from 'react';

import type { PlaceholderProps } from '../Placeholder.types';
import type { ChainLinkDirection } from '../ChainLink/ChainLink.types';

/**
 * Props for the MetalPlate composite placeholder component.
 *
 * MetalPlate is a container that layers ChainLink and HUDScan behind
 * its children, creating a textured metal panel effect.
 */
export type MetalPlateProps = PlaceholderProps & {
  /**
   * Content to display above both texture layers.
   */
  children?: ReactNode;
  /**
   * Direction of the ChainLink diagonal lines.
   * @default 'both' (interlocked grid)
   */
  chainDirection?: ChainLinkDirection;
  /**
   * Gap between ChainLink parallel lines in pixels.
   * @default 18
   */
  chainSpacing?: number;
  /**
   * Thickness of ChainLink lines in pixels.
   * @default 1
   */
  chainThickness?: number;
  /**
   * Intensity of the HUDScan layer.
   * @default same as the plate's `intensity` prop
   */
  scanIntensity?: PlaceholderProps['intensity'];
};
