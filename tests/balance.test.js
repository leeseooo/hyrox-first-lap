import { describe, expect, it } from 'vitest';
import { divisions } from '../src/data/divisions.js';
import { coursePlan } from '../src/race/course.js';
import { createPacing, stepPacing } from '../src/race/pacing.js';

const DT = 1 / 60;
// Walks one race the way main.js frame() does and returns the race clock.
function simulate(doubles, holdWhen) {
  let sim = createPacing(),
    time = 0;
  for (const segment of coursePlan(doubles)) {
    let phaseTime = 0;
    while (phaseTime < segment.length) {
      sim = stepPacing(sim, { holding: holdWhen(sim), segment, dt: DT });
      if (segment.clock) time += DT;
      phaseTime += DT * sim.pace;
    }
  }
  return { time, blowups: sim.blowups };
}
const ride = (cap) => (sim) => sim.effort < cap;

describe.each(divisions)('balance — $label', ({ doubles }) => {
  const rides = [0.6, 0.8, 0.95].map((cap) => simulate(doubles, ride(cap)));
  const hold = simulate(doubles, () => true);
  const ease = simulate(doubles, () => false);

  it('rewards riding closer to the red line', () => {
    expect(rides[1].time).toBeLessThan(rides[0].time);
    expect(rides[2].time).toBeLessThan(rides[1].time);
    for (const r of rides) expect(r.blowups).toBe(0);
  });
  it('makes holding all the way at least 10% slower than the best ride', () => {
    expect(hold.blowups).toBeGreaterThan(0);
    expect(hold.time).toBeGreaterThan(rides[2].time * 1.1);
  });
  it('makes never pushing the slowest', () => {
    expect(ease.time).toBeGreaterThan(hold.time);
  });
});
