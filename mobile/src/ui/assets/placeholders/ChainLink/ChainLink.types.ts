import type { PlaceholderProps } from '../Placeholder.types';

/**
 * Direction of the diagonal lines in the chain-link pattern.
 * - `'forward'` = lines at +45° only (/ / / /)
 * - `'backward'` = lines at -45° only (\ \ \ \)
 * - `'both'` = interlocked grid pattern
 */
export type ChainLinkDirection = 'forward' | 'backward' | 'both';

/**
 * Props for the ChainLink placeholder component.
 *
 * ChainLink renders a metal chain-link fence texture using two grids of diagonal
 * lines at +45° and -45°. It's typically used as a background surface texture
 * inside cards or panels.
 *
 * @example
 * ```tsx
 * <ChainLink intensity="medium" />
 * <ChainLink direction="forward" spacing={24} thickness={2} />
 * ```
 */
export type ChainLinkProps = PlaceholderProps & {
  /**
   * Direction of the diagonal lines.
   * @default 'both' (interlocked grid)
   */
  direction?: ChainLinkDirection;
  /**
   * Gap between parallel lines in pixels.
   * @default 18
   */
  spacing?: number;
  /**
   * Line stroke thickness in pixels.
   * @default 1
   */
  thickness?: number;
};
