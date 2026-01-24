type HapticIntensity = 'light' | 'medium' | 'heavy';

export function haptic(intensity: HapticIntensity = 'light') {
  if (!navigator.vibrate) return;
  
  const patterns = {
    light: 10,
    medium: 25,
    heavy: 50,
  };
  
  navigator.vibrate(patterns[intensity]);
}

export function hapticSuccess() {
  if (!navigator.vibrate) return;
  navigator.vibrate([10, 50, 20]);
}

export function hapticError() {
  if (!navigator.vibrate) return;
  navigator.vibrate([50, 30, 50]);
}

export function hapticTick() {
  haptic('light');
}
