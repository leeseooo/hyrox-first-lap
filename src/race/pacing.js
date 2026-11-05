// Heart-rate pacing: holding pushes the pace up, releasing eases it down.
// Above a segment's threshold the effort climbs; at 1 the athlete blows up.
export const PACING = {
  hold: 1,
  ease: 0.3,
  blownPace: 0.15,
  accel: 3,
  decel: 2,
  rise: 0.67,
  // Recovery scales with the current effort, like a real heart rate.
  fall: 0.4,
  // Effort lost per second while the teammate works.
  rest: 0.15,
  blownMin: 3,
  recoverBelow: 0.7,
};
// Bump when the numbers above change, so old personal bests stop counting.
export const RULES_VERSION = 1;

export function createPacing() {
  return { pace: 0, effort: 0, blown: false, blownFor: 0, blowups: 0 };
}

export function stepPacing(sim, { holding, segment, dt }) {
  const p = PACING;
  let { pace, effort, blown, blownFor, blowups } = sim;
  if (segment.auto) {
    pace = segment.autoPace;
    effort -= p.rest * dt;
  } else {
    const target = blown ? p.blownPace : holding ? p.hold : p.ease,
      rate = target > pace ? p.accel : p.decel;
    pace += Math.sign(target - pace) * Math.min(Math.abs(target - pace), rate * dt);
    effort +=
      pace > segment.threshold
        ? (pace - segment.threshold) * p.rise * dt
        : -(segment.threshold - pace) * p.fall * effort * dt;
  }
  effort = Math.min(1, Math.max(0, effort));
  if (blown) {
    blownFor += dt;
    if (blownFor >= p.blownMin && effort < p.recoverBelow) {
      blown = false;
      blownFor = 0;
    }
  } else if (effort >= 1) {
    blown = true;
    blownFor = 0;
    blowups += 1;
  }
  return { pace, effort, blown, blownFor, blowups };
}
