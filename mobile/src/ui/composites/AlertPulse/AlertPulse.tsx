import { useEffect } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

type AlertPulseProps = {
  color: string;
  style?: StyleProp<ViewStyle>;
};

// Latido: un lavado de color que sube y baja de opacidad en bucle — reemplaza
// la barra de escaneo descendente para el estado de ALERTA. Palpita, no viaja.
export function AlertPulse({ color, style }: AlertPulseProps) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 650, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => cancelAnimation(pulse);
  }, [pulse]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.06 + pulse.value * 0.26,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[style, { backgroundColor: color }, animatedStyle]}
    />
  );
}
