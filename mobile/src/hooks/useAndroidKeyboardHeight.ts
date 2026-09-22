import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * Altura del teclado en Android (0 cuando esta cerrado).
 * En Android adjustResize no aplica dentro de ScrollView centrado, asi que
 * las pantallas la usan como paddingBottom para que el teclado "empuje"
 * el formulario en vez de taparlo. iOS usa KeyboardAvoidingView.
 */
export function useAndroidKeyboardHeight(): number {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    if (Keyboard.isVisible()) {
      const metrics = Keyboard.metrics();
      if (metrics) {
        setKeyboardHeight(metrics.height);
      }
    }

    const showSub = Keyboard.addListener('keyboardDidShow', (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return keyboardHeight;
}
