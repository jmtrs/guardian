import type { StyleProp, ViewStyle } from 'react-native';

/**
 * Intensity level controls the opacity of placeholder elements.
 * - `low`: 14% opacity (subtle background texture)
 * - `medium`: 26% opacity (standard visual interest)
 * - `high`: 42% opacity (strong emphasis, overlays)
 */
export type PlaceholderIntensity = 'low' | 'medium' | 'high';

/**
 * Tone determines the base color of placeholder elements.
 * - `carbon`: Asphalt/grey color for backgrounds
 * - `warning`: Amber/warning yellow for alerts and indicators
 * - `smoke`: Primary foreground color for subtle overlays
 */
export type PlaceholderTone = 'carbon' | 'warning' | 'smoke';

/**
 * Base props shared by all placeholder components.
 */
export type PlaceholderProps = {
  /**
   * Additional styles to apply to the placeholder.
   */
  style?: StyleProp<ViewStyle>;
  /**
   * Intensity level controls opacity.
   * @default 'medium'
   */
  intensity?: PlaceholderIntensity;
  /**
   * Tone determines base color.
   * @default 'carbon'
   */
  tone?: PlaceholderTone;
};
