import { StyleSheet } from 'react-native';

import { darkTheme } from '@/ui/theme';

const AMBER = darkTheme.semantic.accent.warning;

/**
 * Total height of the trail block in pixels.
 * All layer `bottom` values are relative to this.
 * @defaultValue 110
 */
export const TRAIL_H = 110;

/**
 * HUDScan component styles.
 *
 * The radar sweep effect uses multiple overlapping layers:
 * - trailFar: distant faint trail (60px, opacity 0.04)
 * - trailMid: medium trail (30px, opacity 0.09)
 * - trailNear: near trail (12px, opacity 0.18)
 * - scanLine: bright leading edge (2px, opacity 0.75)
 * - afterGlow: continuation after line (5px, opacity 0.08)
 * - tickLeft/Right: marker ticks at scan position
 * - echoLine: dimmer trailing echo line
 */
export const styles = StyleSheet.create({
  /**
   * Root container style.
   * Uses `absoluteFillObject` to cover the entire parent container.
   */
  root: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  /**
   * Distant trail layer - 60px height, bottom 50px from TRAIL_H.
   * Faintest trail element for depth effect.
   */
  trailFar: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 60,
    bottom: TRAIL_H - 60,
    backgroundColor: AMBER,
    opacity: 0.04,
  },
  /**
   * Middle trail layer - 30px height, bottom 20px from TRAIL_H.
   * Medium opacity trail element.
   */
  trailMid: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 30,
    bottom: TRAIL_H - 90,
    backgroundColor: AMBER,
    opacity: 0.09,
  },
  /**
   * Near trail layer - 12px height, bottom 8px from TRAIL_H.
   * Higher opacity trail element closer to scan line.
   */
  trailNear: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 12,
    bottom: TRAIL_H - 102,
    backgroundColor: AMBER,
    opacity: 0.18,
  },
  /**
   * Main scan line - 2px height, bottom 6px from TRAIL_H.
   * Brightest element (opacity 0.75) representing the leading edge.
   */
  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    bottom: TRAIL_H - 104,
    backgroundColor: AMBER,
    opacity: 0.75,
  },
  /**
   * After-glow element - 5px height, bottom 1px from TRAIL_H.
   * Faint continuation after the main scan line.
   */
  afterGlow: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 5,
    bottom: TRAIL_H - 109,
    backgroundColor: AMBER,
    opacity: 0.08,
  },
  /**
   * Left tick marker - 6x2px at bottom of scan area.
   * Full opacity marker for HUD aesthetic.
   */
  tickLeft: {
    position: 'absolute',
    left: 0,
    width: 6,
    height: 2,
    bottom: TRAIL_H - 104,
    backgroundColor: AMBER,
    opacity: 1,
  },
  /**
   * Right tick marker - 6x2px at bottom of scan area.
   * Full opacity marker for HUD aesthetic.
   */
  tickRight: {
    position: 'absolute',
    right: 0,
    width: 6,
    height: 2,
    bottom: TRAIL_H - 104,
    backgroundColor: AMBER,
    opacity: 1,
  },
  /**
   * Echo line - 1px height, 8px from each side.
   * Dimmer line that always trails the main scan.
   */
  echoLine: {
    position: 'absolute',
    left: 8,
    right: 8,
    height: 1,
    backgroundColor: AMBER,
    opacity: 0.2,
  },
});
