import { describe, expect, it } from 'vitest';
import { coursePlan } from '../src/race/course.js';
import {
  alongPath,
  clockedPlan,
  decodeGhost,
  encodeGhost,
  formatDelta,
  ghostAt,
  ghostTimeAt,
} from '../src/race/ghost.js';
import { RULES_VERSION } from '../src/race/pacing.js';

// A plausible race: every clocked segment takes its full length at pace 0.9.
const race = (doubles) => {
  let t = 0;
  return clockedPlan(doubles).map((segment) => (t += segment.length / 0.9));
};

describe('clockedPlan', () => {
  it('keeps only the segments the race clock runs through', () => {
    expect(clockedPlan(false)).toHaveLength(32);
    expect(clockedPlan(true)).toHaveLength(48);
    expect(clockedPlan(false).every((s) => s.clock)).toBe(true);
    expect(clockedPlan(true).at(-1).mode).toBe(coursePlan(true).at(-2).mode);
  });
});

describe('ghost links', () => {
  it('round-trips a race to within a tenth of a second at every split', () => {
    const times = race(false),
      text = encodeGhost({ division: 'men-single', times }),
      ghost = decodeGhost(text);
    expect(text.startsWith(`men-single_${RULES_VERSION}_`)).toBe(true);
    expect(text.length).toBeLessThan(140);
    expect(ghost.division).toBe('men-single');
    expect(ghost.times).toHaveLength(32);
    ghost.times.forEach((t, i) => expect(Math.abs(t - times[i])).toBeLessThanOrEqual(0.05 + 1e-9));
  });

  it('reads a doubles race', () => {
    const ghost = decodeGhost(encodeGhost({ division: 'mixed-doubles', times: race(true) }));
    expect(ghost.times).toHaveLength(48);
  });

  it('ignores links that do not fit this course or these rules', () => {
    const good = encodeGhost({ division: 'men-single', times: race(false) }),
      [, , deltas] = good.split('_');
    expect(decodeGhost('')).toBeNull();
    expect(decodeGhost(null)).toBeNull();
    expect(decodeGhost('nonsense')).toBeNull();
    expect(decodeGhost(`unknown-division_${RULES_VERSION}_${deltas}`)).toBeNull();
    expect(decodeGhost(`men-single_${RULES_VERSION + 1}_${deltas}`)).toBeNull();
    // A singles race does not fit the doubles course.
    expect(decodeGhost(`mixed-doubles_${RULES_VERSION}_${deltas}`)).toBeNull();
    expect(decodeGhost(`men-single_${RULES_VERSION}_${deltas}.5`)).toBeNull();
    expect(decodeGhost(good.replace(/\.[0-9a-z]+\./, '.0.'))).toBeNull();
    expect(decodeGhost(good.replace(/\.[0-9a-z]+\./, '.!!.'))).toBeNull();
  });
});

describe('ghostTimeAt', () => {
  const times = [10, 30, 40];
  it('finds when the ghost passed the same point', () => {
    expect(ghostTimeAt(times, 0, 0)).toBe(0);
    expect(ghostTimeAt(times, 0, 0.5)).toBe(5);
    expect(ghostTimeAt(times, 1, 0.25)).toBe(15);
    expect(ghostTimeAt(times, 2, 1)).toBe(40);
  });
  it('holds at the finish after the last split', () => {
    expect(ghostTimeAt(times, 3, 0.5)).toBe(40);
  });
});

describe('ghostAt', () => {
  const times = [10, 30, 40];
  it('places the ghost inside the segment it was running at that time', () => {
    expect(ghostAt(times, 0)).toEqual({ index: 0, progress: 0, done: false });
    expect(ghostAt(times, 5)).toEqual({ index: 0, progress: 0.5, done: false });
    expect(ghostAt(times, 10)).toEqual({ index: 1, progress: 0, done: false });
    expect(ghostAt(times, 35)).toEqual({ index: 2, progress: 0.5, done: false });
  });
  it('parks the ghost at the finish once it is done', () => {
    expect(ghostAt(times, 40)).toEqual({ index: 2, progress: 1, done: true });
    expect(ghostAt(times, 99)).toEqual({ index: 2, progress: 1, done: true });
  });
});

describe('formatDelta', () => {
  it('shows the gap in race time with a sign', () => {
    // 0.8 game seconds is 12 race seconds.
    expect(formatDelta(-0.8)).toBe('-0:12');
    expect(formatDelta(3)).toBe('+0:45');
    expect(formatDelta(300)).toBe('+1:15:00');
    expect(formatDelta(0.01)).toBe('0:00');
    expect(formatDelta(3, false)).toBe('0:45');
  });
});

describe('alongPath', () => {
  const path = [
    [0, 0],
    [3, 0],
    [3, 1],
  ];
  it('walks a polyline by its length', () => {
    expect(alongPath(path, 0)).toEqual([0, 0]);
    expect(alongPath(path, 0.5)).toEqual([2, 0]);
    expect(alongPath(path, 0.875)).toEqual([3, 0.5]);
    expect(alongPath(path, 1)).toEqual([3, 1]);
  });
  it('clamps progress and copes with a single point', () => {
    expect(alongPath(path, 2)).toEqual([3, 1]);
    expect(alongPath([[5, 6]], 0.5)).toEqual([5, 6]);
  });
});
