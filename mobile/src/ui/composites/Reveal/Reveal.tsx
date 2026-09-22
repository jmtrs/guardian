import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

// Content rises up + fades in on mount — the "todo aparece como por debajo"
// motion. Stagger a list by passing an increasing `delay` per item so rows
// cascade in from below the grid instead of popping in at once.

type RevealProps = {
  children: ReactNode;
  /** Stagger offset in ms. */
  delay?: number;
  /** Rise distance in px. */
  distance?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
};

export function Reveal({
  children,
  delay = 0,
  distance = 18,
  duration = 340,
  style,
}: RevealProps) {
  return (
    <Animated.View
      style={style}
      entering={FadeInDown.springify()
        .damping(18)
        .mass(0.6)
        .delay(delay)
        .duration(duration)
        .withInitialValues({ transform: [{ translateY: distance }], opacity: 0 })}
    >
      {children}
    </Animated.View>
  );
}
