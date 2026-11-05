import { describe, expect, it } from 'vitest';
import { heartRate, strainCamera, strainLevel } from '../src/race/strain.js';

const still = { roll: 0, pitch: 0, fov: 0, bob: 0 };

describe('strain', () => {
  it('starts at 70% effort', () => {
    expect(strainLevel(0.5)).toBe(0);
    expect(strainLevel(0.7)).toBe(0);
    expect(strainLevel(0.85)).toBeCloseTo(0.5);
    expect(strainLevel(1)).toBe(1);
  });

  it('maps effort to a display heart rate', () => {
    expect(heartRate(0)).toBe(110);
    expect(heartRate(1)).toBe(195);
  });

  it('narrows the view at full strain and stays still below it', () => {
    expect(strainCamera({ effort: 1, time: 0 }).fov).toBeCloseTo(-8);
    expect(strainCamera({ effort: 0.5, time: 3 })).toEqual(still);
  });

  it('slumps the camera when blown', () => {
    const camera = strainCamera({ effort: 0.9, blown: true, time: 0 });
    expect(camera.roll).toBeCloseTo(0.105);
    expect(camera.pitch).toBeLessThan(0);
  });

  it('stays still with reduced motion', () => {
    expect(strainCamera({ effort: 1, blown: true, reduced: true, time: 1 })).toEqual(still);
  });
});
