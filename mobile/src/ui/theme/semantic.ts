import type { TypographyWeight } from '@/ui/foundations';
import { coreTokens } from '@/ui/foundations';

import { uiFontFamily } from './fonts';
import type { AccentPalette } from './palette';
import { DEFAULT_ACCENT, derivePalette, withAlpha } from './palette';

export type SemanticTheme = {
  bg: {
    canvas: string;
    surface: string;
    surfaceRaised: string;
    inset: string;
    hudPanel: string;
    bezel: string;
  };
  surface: {
    carbon: string;
    panel: string;
    raised: string;
    cutout: string;
  };
  fg: {
    primary: string;
    secondary: string;
    muted: string;
    inverse: string;
  };
  accent: {
    warning: string;
    dirtyAmber: string;
    glow: string;
    red: string;
  };
  border: {
    subtle: string;
    strong: string;
    warning: string;
    metal: string;
    danger: string;
  };
  map: {
    road: string;
    grid: string;
    route: string;
    marker: string;
  };
  state: {
    disabled: string;
    error: string;
    selected: string;
    focusRing: string;
  };
  // Baked rgba glow tints — RN can't read CSS vars, so we precompute the alpha
  // literals autobahn writes inline (text-shadow / inset glows).
  glow: {
    text: string; // amber text-shadow
    textStrong: string;
    panel: string; // inset panel glow
    grid: string; // scanline grid line color
  };
};

export type UITheme = {
  name: 'dark';
  tokens: typeof coreTokens;
  semantic: SemanticTheme;
  fontFamily: {
    display: string;
    ui: Record<TypographyWeight, string>;
  };
  elevation: {
    flat: typeof coreTokens.shadow.none;
    raised: typeof coreTokens.shadow.md;
    overlay: typeof coreTokens.shadow.lg;
  };
  ornament: {
    maxTextureLayers: 2;
    maxOverlayLayers: 1;
  };
};

// Neutral foreground (readout text) stays smoke-colored across themes — only
// accents, glows, bg and borders retint. Matches autobahn keeping digits light
// against the amber glass, not tinting the type itself.
function buildSemanticTheme(p: AccentPalette): SemanticTheme {
  return {
    bg: {
      // Pure black canvas — AMOLED pixels stay off across the whole backdrop.
      // Panels/insets keep the faint accent tint for depth (small lit area).
      canvas: '#000000',
      surface: p.surface,
      surfaceRaised: p.surfaceRaised,
      inset: p.inset,
      hudPanel: p.surface,
      bezel: p.bezel,
    },
    surface: {
      carbon: p.inset,
      panel: p.surface,
      raised: p.surfaceRaised,
      cutout: coreTokens.color['smoke.050'],
    },
    fg: {
      // Text follows the accent (like autobahn's all-amber readouts) instead of
      // neutral white — brightest tone for primary, accent for secondary, dim
      // for muted. Keeps the whole UI on the chosen palette.
      primary: p.accentGlow,
      secondary: p.accent,
      muted: p.accentMuted,
      inverse: '#000000',
    },
    accent: {
      warning: p.accent,
      dirtyAmber: p.accentDim,
      glow: p.accentGlow,
      red: coreTokens.color['dangerRed.500'],
    },
    border: {
      subtle: withAlpha(p.accent, 0.14),
      strong: p.border,
      warning: p.accent,
      metal: withAlpha(p.accent, 0.28),
      danger: coreTokens.color['dangerRed.500'],
    },
    map: {
      road: coreTokens.color['map.road'],
      grid: coreTokens.color['map.grid'],
      route: p.accentDim,
      marker: p.accent,
    },
    state: {
      disabled: withAlpha(p.accent, 0.18),
      error: coreTokens.color['dangerRed.500'],
      selected: p.accent,
      focusRing: p.accentGlow,
    },
    glow: {
      text: withAlpha(p.accent, 0.5),
      textStrong: withAlpha(p.accentGlow, 0.9),
      panel: withAlpha(p.accent, 0.08),
      grid: withAlpha(p.accent, 0.06),
    },
  };
}

export function buildTheme(accentHex: string): UITheme {
  return {
    name: 'dark',
    tokens: coreTokens,
    semantic: buildSemanticTheme(derivePalette(accentHex)),
    fontFamily: uiFontFamily,
    elevation: {
      flat: coreTokens.shadow.none,
      raised: coreTokens.shadow.md,
      overlay: coreTokens.shadow.lg,
    },
    ornament: {
      maxTextureLayers: 2,
      maxOverlayLayers: 1,
    },
  };
}

export const semanticDarkTheme: SemanticTheme = buildSemanticTheme(
  derivePalette(DEFAULT_ACCENT),
);

export const darkTheme: UITheme = buildTheme(DEFAULT_ACCENT);
