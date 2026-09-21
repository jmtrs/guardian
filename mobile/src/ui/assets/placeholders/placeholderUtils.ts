import type { PlaceholderIntensity, PlaceholderTone } from './Placeholder.types';
import { darkTheme } from '@/ui/theme';

/**
 * Returns opacity value based on intensity level.
 *
 * @param intensity - Intensity level: 'low', 'medium', or 'high'
 * @returns Opacity value: 0.14 (low), 0.26 (medium), or 0.42 (high)
 * @default 'medium'
 *
 * @example
 * ```ts
 * getPlaceholderOpacity('low');   // 0.14
 * getPlaceholderOpacity();        // 0.26 (default medium)
 * getPlaceholderOpacity('high');  // 0.42
 * ```
 */
export function getPlaceholderOpacity(intensity: PlaceholderIntensity = 'medium') {
  if (intensity === 'low') {
    return 0.14;
  }

  if (intensity === 'high') {
    return 0.42;
  }

  return 0.26;
}

/**
 * Returns color value based on tone.
 *
 * @param tone - Tone: 'carbon', 'warning', or 'smoke'
 * @returns Color string from the theme
 * @default 'carbon'
 *
 * - `carbon`: `darkTheme.tokens.color['asphalt.800']` - for backgrounds
 * - `warning`: `darkTheme.semantic.accent.warning` - for alerts
 * - `smoke`: `darkTheme.semantic.fg.primary` - for text/overlays
 *
 * @example
 * ```ts
 * getPlaceholderColor('warning'); // Amber warning color
 * getPlaceholderColor();          // Asphalt carbon color (default)
 * getPlaceholderColor('smoke');   // Smoke primary color
 * ```
 */
export function getPlaceholderColor(tone: PlaceholderTone = 'carbon') {
  if (tone === 'warning') {
    return darkTheme.semantic.accent.warning;
  }

  if (tone === 'smoke') {
    return darkTheme.semantic.fg.primary;
  }

  return darkTheme.tokens.color['asphalt.800'];
}
