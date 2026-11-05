// Camera strain from heart-rate effort: nothing below 70%, full at 100%.
const STRAIN_START = 0.7;
const MAX_FOV_NARROW = 8;
const SWAY_ROLL = 0.035;
const MAX_BOB = 0.05;
const BLOWN_ROLL = 0.105;
const BLOWN_PITCH = -0.06;

export function strainLevel(effort) {
  return Math.max(0, Math.min(1, (effort - STRAIN_START) / (1 - STRAIN_START)));
}

// Display-only heart rate.
export function heartRate(effort) {
  return Math.round(110 + effort * 85);
}

export function strainCamera({ effort = 0, blown = false, reduced = false, time = 0 }) {
  const k = strainLevel(effort);
  if (reduced || (k === 0 && !blown)) return { roll: 0, pitch: 0, fov: 0, bob: 0 };
  return {
    roll: (blown ? BLOWN_ROLL : 0) + Math.sin(time * 2.1) * SWAY_ROLL * k,
    pitch: blown ? BLOWN_PITCH : 0,
    fov: -MAX_FOV_NARROW * k,
    bob: Math.abs(Math.sin(time * 9)) * MAX_BOB * k,
  };
}
