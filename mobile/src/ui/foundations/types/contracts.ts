import type { TextStyle } from 'react-native';

export type ComponentSize = 'sm' | 'md' | 'lg';

export type ComponentTone = 'neutral' | 'accent' | 'danger';

export type ComponentState =
  | 'idle'
  | 'pressed'
  | 'focused'
  | 'disabled'
  | 'loading'
  | 'error'
  | 'selected';

export type SpacingToken =
  | '0'
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '8'
  | '10'
  | '12'
  | '14'
  | '16'
  | '18'
  | '20'
  | '24'
  | '28'
  | '32'
  | '36'
  | '40'
  | '44'
  | '48'
  | '52'
  | '56'
  | '60'
  | '64'
  | '68'
  | '72'
  | '76'
  | '80';

export type RadiusToken = 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'pill';

export type BorderWidthToken = 'none' | 'thin' | 'base' | 'strong';

export type BorderColorToken = 'default' | 'accent' | 'danger';

export type ShadowToken = 'none' | 'sm' | 'md' | 'lg';

export type OpacityToken = 'disabled' | 'muted' | 'overlay' | 'pressed';

export type ZIndexToken = 'base' | 'content' | 'overlay' | 'sheet' | 'toast';

export type TypographyScale = 'caption' | 'label' | 'body' | 'title' | 'display';

export type TypographyLetterSpacing = 'tight' | 'base' | 'wide';

export type TypographyWeight = 'regular' | 'medium' | 'semibold' | 'bold';

export type TypographyWeightValue = NonNullable<TextStyle['fontWeight']>;

export type MotionDurationToken = 'fast' | 'base' | 'slow';

export type MotionEasingToken = 'snap' | 'sweep';

export type ShadowValue = {
  shadowColor: string;
  shadowOpacity: number;
  shadowOffset: {
    width: number;
    height: number;
  };
  shadowRadius: number;
  elevation: number;
};

export type ThemeTokens = {
  color: Record<string, string>;
  spacing: Record<SpacingToken, number>;
  radius: Record<RadiusToken, number>;
  border: {
    width: Record<BorderWidthToken, number>;
    color: Record<BorderColorToken, string>;
  };
  shadow: Record<ShadowToken, ShadowValue>;
  opacity: Record<OpacityToken, number>;
  zIndex: Record<ZIndexToken, number>;
  typography: {
    family: {
      display: string[];
      ui: string[];
    };
    size: Record<TypographyScale, number>;
    lineHeight: Record<TypographyScale, number>;
    letterSpacing: Record<TypographyLetterSpacing, number>;
    weight: Record<TypographyWeight, TypographyWeightValue>;
  };
  motion: {
    duration: Record<MotionDurationToken, number>;
    easing: Record<MotionEasingToken, string>;
  };
};
