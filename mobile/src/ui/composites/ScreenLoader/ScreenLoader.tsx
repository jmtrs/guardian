import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useUITheme } from '@/ui/theme';

// VFD-style loader — a row of square "pixels" blinking in sequence on the black
// glass, instead of the platform spinner (which looks foreign and ignores the
// theme). Full-screen; used for between-screen / route-guard loads.

function Blip({ index, color }: { index: number; color: string }) {
  const o = useSharedValue(0.15);
  useEffect(() => {
    o.value = withDelay(
      index * 130,
      withRepeat(
        withSequence(withTiming(1, { duration: 260 }), withTiming(0.15, { duration: 260 })),
        -1,
        false,
      ),
    );
  }, [o, index]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View
      style={[{ width: 9, height: 9, marginHorizontal: 3, backgroundColor: color }, style]}
    />
  );
}

export function ScreenLoader({ label }: { label?: string }) {
  const theme = useUITheme();
  const accent = theme.semantic.accent.warning;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.semantic.bg.canvas,
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.tokens.spacing['5'],
      }}
    >
      <View style={{ flexDirection: 'row' }}>
        {[0, 1, 2, 3].map((i) => (
          <Blip key={i} index={i} color={accent} />
        ))}
      </View>
      {label ? (
        <Text
          style={{
            color: theme.semantic.fg.muted,
            fontFamily: theme.fontFamily.ui.medium,
            fontSize: 12,
            letterSpacing: 4,
            textTransform: 'uppercase',
          }}
        >
          {label}
        </Text>
      ) : null}
    </View>
  );
}
