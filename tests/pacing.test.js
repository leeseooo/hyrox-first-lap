import { describe, expect, it } from 'vitest';
import { PACING, createPacing, stepPacing } from '../src/race/pacing.js';

const run = { mode: 'run', length: 9, threshold: 0.75, auto: false, clock: true };
const partner = {
  mode: 'partner',
  length: 6,
  threshold: 1,
  auto: true,
  autoPace: 0.8,
  clock: true,
};
const at = (overrides) => ({ ...createPacing(), ...overrides });
const step = (sim, holding, segment = run, dt = 0.1) => stepPacing(sim, { holding, segment, dt });

describe('stepPacing', () => {
  it('accelerates toward full pace while holding', () => {
    expect(step(createPacing(), true).pace).toBeCloseTo(0.3);
  });

  it('eases toward the breathing pace when released', () => {
    expect(step(at({ pace: 1 }), false).pace).toBeCloseTo(0.8);
  });

  it('raises effort above the threshold', () => {
    expect(step(at({ pace: 1, effort: 0.5 }), true, run, 1).effort).toBeCloseTo(
      0.5 + 0.25 * PACING.rise,
    );
  });

  it('recovers faster from a higher effort', () => {
    const low = step(at({ pace: 0.3, effort: 0.4 }), false),
      high = step(at({ pace: 0.3, effort: 0.8 }), false);
    expect(0.8 - high.effort).toBeCloseTo(2 * (0.4 - low.effort));
  });

  it('blows up at full effort and counts it', () => {
    expect(step(at({ pace: 1, effort: 0.999 }), true)).toMatchObject({
      effort: 1,
      blown: true,
      blowups: 1,
    });
  });

  it('holds the blown pace whatever the input', () => {
    const next = step(at({ pace: 0.15, effort: 0.9, blown: true }), true);
    expect(next.pace).toBeCloseTo(0.15);
    expect(next.blown).toBe(true);
  });

  it('needs both three seconds and effort under 0.7 to recover', () => {
    expect(step(at({ pace: 0.15, effort: 0.5, blown: true, blownFor: 2 }), true).blown).toBe(true);
    expect(step(at({ pace: 0.15, effort: 0.95, blown: true, blownFor: 5 }), true).blown).toBe(true);
    expect(step(at({ pace: 0.15, effort: 0.5, blown: true, blownFor: 2.95 }), true)).toMatchObject({
      blown: false,
      blownFor: 0,
    });
  });

  it('lets the teammate work while you recover', () => {
    const next = step(at({ pace: 1, effort: 0.6 }), true, partner, 1);
    expect(next.pace).toBe(0.8);
    expect(next.effort).toBeCloseTo(0.45);
  });

  it('keeps effort between 0 and 1', () => {
    expect(step(at({ pace: 1, effort: 0.99 }), true, run, 10).effort).toBe(1);
    expect(step(at({ pace: 0.3, effort: 0.01 }), false, run, 10).effort).toBe(0);
  });
});
