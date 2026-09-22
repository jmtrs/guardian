import { Text, View } from 'react-native';

import { useUITheme } from '@/ui/theme';

// Deliberate empty/placeholder state — a bordered HUD panel with a glyph badge,
// title and hint, instead of a lone line of muted text floating on the screen.

type EmptyStateProps = {
  glyph: string;
  title: string;
  hint?: string;
};

export function EmptyState({ glyph, title, hint }: EmptyStateProps) {
  const theme = useUITheme();
  const { semantic, tokens, fontFamily } = theme;

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: semantic.border.metal,
        backgroundColor: semantic.bg.surface,
        paddingVertical: tokens.spacing['12'],
        paddingHorizontal: tokens.spacing['6'],
        alignItems: 'center',
        gap: tokens.spacing['4'],
      }}
    >
      <View
        style={{
          width: 56,
          height: 56,
          borderWidth: 1,
          borderColor: semantic.border.metal,
          backgroundColor: semantic.bg.inset,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: semantic.accent.warning, fontSize: 24 }}>{glyph}</Text>
      </View>
      <Text
        style={{
          color: semantic.fg.secondary,
          fontFamily: fontFamily.display,
          fontSize: 16,
          letterSpacing: 3,
          textTransform: 'uppercase',
          textAlign: 'center',
        }}
      >
        {title}
      </Text>
      {hint ? (
        <Text
          style={{
            color: semantic.fg.muted,
            fontFamily: fontFamily.ui.regular,
            fontSize: 13,
            lineHeight: 20,
            textAlign: 'center',
          }}
        >
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
