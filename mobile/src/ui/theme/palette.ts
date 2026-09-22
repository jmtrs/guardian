// Accent-driven palette. Ported from cc-autobahn's theme.js: a whole VFD
// palette is derived from ONE accent color via HSL, so a single color pick
// (Settings → THEME) repaints the entire instrument-cluster skin. Presets are
// just hand-picked accent hexes fed through the same derivation, so every
// theme stays internally consistent (warm near-black bg, glow, borders).

export type AccentPalette = {
  accent: string; // main readout color (autobahn --amber)
  accentDim: string; // unlit / secondary (--amber-dim)
  accentMuted: string; // dim BUT still legible text (labels, captions)
  accentGlow: string; // highlight glow (--amber-glow)
  canvas: string; // display glass background (--bg)
  bezel: string; // surrounding frame (--bezel)
  surface: string; // panel fill
  surfaceRaised: string; // raised panel fill
  inset: string; // recessed / darkest fill
  border: string; // metal hairline derived from accent
};

export type ThemePreset = {
  id: string;
  label: string;
  accent: string;
};

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

function hexToHsl(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case r:
      h = (g - b) / d + (g < b ? 6 : 0);
      break;
    case g:
      h = (b - r) / d + 2;
      break;
    default:
      h = (r - g) / d + 4;
  }
  return { h: h * 60, s: s * 100, l: l * 100 };
}

function hslToHex(h: number, s: number, l: number) {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (n: number) =>
    Math.round(f(n) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(0)}${toHex(8)}${toHex(4)}`;
}

/**
 * Derives the full VFD palette from a single accent color. Mirrors autobahn's
 * relationship (dim ≈ half lightness, glow ≈ +15pt, bg/bezel near-black with a
 * faint hue tint). The accent lightness is floored so a very dark pick stays
 * legible against the near-black canvas.
 */
export function derivePalette(accentHex: string): AccentPalette {
  const { h, s, l: rawL } = hexToHsl(accentHex);
  const l = clamp(rawL, 34, 100);
  return {
    accent: hslToHex(h, s, l),
    accentDim: hslToHex(h, s, clamp(l * 0.5, 22, 42)),
    // Desaturated + kept bright (L~60) so muted labels stay readable on black.
    accentMuted: hslToHex(h, Math.min(s, 32), 62),
    accentGlow: hslToHex(h, Math.min(s, 100), clamp(l + 15, 0, 90)),
    canvas: hslToHex(h, Math.min(s, 42), 3),
    bezel: hslToHex(h, Math.min(s, 34), 7),
    surface: hslToHex(h, Math.min(s, 28), 6),
    surfaceRaised: hslToHex(h, Math.min(s, 26), 9),
    inset: hslToHex(h, Math.min(s, 34), 2),
    border: hslToHex(h, Math.min(s, 24), 22),
  };
}

// A vivid accent from a single hue (0-360) — backs the Settings hue slider,
// mirroring autobahn's single-accent CUSTOM picker.
export function accentFromHue(hue: number): string {
  return hslToHex(((hue % 360) + 360) % 360, 85, 55);
}

// Hue (0-360) of a hex, so the slider can seed from a stored custom accent.
export function hueOfHex(hex: string): number {
  return hexToHsl(hex).h;
}

// rgba() helper — RN has no CSS var glow, so callers bake alpha per use.
export function withAlpha(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Presets mirror cc-autobahn's THEME dropdown (amber default + 3 alts).
export const THEME_PRESETS: ThemePreset[] = [
  { id: 'amber', label: 'AMBER', accent: '#FF9F1C' },
  { id: 'emerald', label: 'EMERALD', accent: '#2DD881' },
  { id: 'ice', label: 'ICE', accent: '#4FC3FF' },
  { id: 'ruby', label: 'RUBY', accent: '#FF3B30' },
  { id: 'white', label: 'WHITE', accent: '#FFFFFF' },
];

export const DEFAULT_ACCENT = THEME_PRESETS[0].accent;
