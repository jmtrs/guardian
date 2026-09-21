import type { TypographyWeight } from '@/ui/foundations';
import { coreTokens } from '@/ui/foundations';

import { uiFontFamily } from './fonts';

export type SemanticTheme = {
  bg: {
    canvas: string;
    surface: string;
    surfaceRaised: string;
    inset: string;
    hudPanel: string;
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

export const semanticDarkTheme: SemanticTheme = {
  bg: {
    canvas: coreTokens.color['black.1000'],
    surface: coreTokens.color['carbon.900'],
    surfaceRaised: coreTokens.color['carbon.850'],
    inset: coreTokens.color['carbon.950'],
    hudPanel: coreTokens.color['carbon.900'],
  },
  surface: {
    carbon: coreTokens.color['carbon.950'],
    panel: coreTokens.color['carbon.900'],
    raised: coreTokens.color['carbon.850'],
    cutout: coreTokens.color['smoke.050'],
  },
  fg: {
    primary: coreTokens.color['smoke.050'],
    secondary: coreTokens.color['smoke.100'],
    muted: coreTokens.color['smoke.300'],
    inverse: coreTokens.color['black.1000'],
  },
  accent: {
    warning: coreTokens.color['warningYellow.500'],
    dirtyAmber: coreTokens.color['dirtyAmber.500'],
    red: coreTokens.color['dangerRed.500'],
  },
  border: {
    subtle: coreTokens.color['steel.700'],
    strong: coreTokens.color['smoke.300'],
    warning: coreTokens.color['warningYellow.500'],
    metal: coreTokens.color['steel.500'],
    danger: coreTokens.color['dangerRed.500'],
  },
  map: {
    road: coreTokens.color['map.road'],
    grid: coreTokens.color['map.grid'],
    route: coreTokens.color['map.route'],
    marker: coreTokens.color['map.marker'],
  },
  state: {
    disabled: coreTokens.color['steel.700'],
    error: coreTokens.color['dangerRed.500'],
    selected: coreTokens.color['warningYellow.500'],
    focusRing: coreTokens.color['warningYellow.400'],
  },
};

export const darkTheme: UITheme = {
  name: 'dark',
  tokens: coreTokens,
  semantic: semanticDarkTheme,
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
