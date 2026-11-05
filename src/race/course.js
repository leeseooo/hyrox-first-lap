import { stations } from '../data/stations.js';

// Segment lengths are seconds at pace 1.0 — the old hold-to-move durations.
const RUN_LENGTH = 9;
const TRAVEL_LENGTH = { enter: 4, exit: 4, handoff: 2.5, finish: 6 };
const CELEBRATE_LENGTH = 3;
// The pace each segment can sustain before the heart rate climbs.
const RUN_THRESHOLD = 0.75;
const TRAVEL_THRESHOLD = 0.9;
// Doubles: the teammate works the second half on their own at this pace.
const PARTNER_PACE = 0.8;

export function segmentFor(mode, stationIndex, doubles) {
  if (mode === 'run')
    return { mode, length: RUN_LENGTH, threshold: RUN_THRESHOLD, auto: false, clock: true };
  if (mode in TRAVEL_LENGTH)
    return {
      mode,
      length: TRAVEL_LENGTH[mode],
      threshold: TRAVEL_THRESHOLD,
      auto: false,
      clock: true,
    };
  const station = stations[stationIndex],
    half = station.duration * (doubles ? 0.5 : 1);
  if (mode === 'workout')
    return { mode, length: half, threshold: station.threshold, auto: false, clock: true };
  if (mode === 'partner')
    return { mode, length: half, threshold: 1, auto: true, autoPace: PARTNER_PACE, clock: true };
  // celebrate · complete: the clock has stopped at the finish line.
  return { mode, length: CELEBRATE_LENGTH, threshold: 1, auto: true, autoPace: 1, clock: false };
}

// Every segment of one race in order, as main.js walks through them.
export function coursePlan(doubles) {
  const plan = [];
  for (let i = 0; i < 8; i++) {
    const phase = i * 2 + 1,
      modes = [
        'enter',
        'workout',
        ...(doubles ? ['handoff', 'partner'] : []),
        i < 7 ? 'exit' : 'finish',
      ];
    plan.push({ phase: i * 2, ...segmentFor('run', i, doubles) });
    for (const mode of modes) plan.push({ phase, ...segmentFor(mode, i, doubles) });
  }
  plan.push({ phase: 15, ...segmentFor('celebrate', 7, doubles) });
  return plan;
}
