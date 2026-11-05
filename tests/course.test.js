import { describe, expect, it } from 'vitest';
import { stations } from '../src/data/stations.js';
import { coursePlan, segmentFor } from '../src/race/course.js';

describe('station thresholds', () => {
  it('gives each station the pace it can sustain', () => {
    expect(stations.map((s) => s.threshold)).toEqual([0.7, 0.55, 0.6, 0.6, 0.7, 0.8, 0.6, 0.5]);
  });
});

describe('segmentFor', () => {
  it('keeps the old hold-to-move lengths', () => {
    expect(segmentFor('run', 0, false).length).toBe(9);
    expect(segmentFor('enter', 0, false).length).toBe(4);
    expect(segmentFor('exit', 0, false).length).toBe(4);
    expect(segmentFor('handoff', 0, true).length).toBe(2.5);
    expect(segmentFor('finish', 7, false).length).toBe(6);
    expect(segmentFor('celebrate', 7, false).length).toBe(3);
    expect(segmentFor('workout', 7, false).length).toBe(15);
    expect(segmentFor('workout', 7, true).length).toBe(7.5);
    expect(segmentFor('partner', 7, true).length).toBe(7.5);
  });

  it('uses the run, roxzone and station thresholds', () => {
    expect(segmentFor('run', 3, false).threshold).toBe(0.75);
    expect(segmentFor('enter', 3, false).threshold).toBe(0.9);
    expect(segmentFor('workout', 7, false).threshold).toBe(0.5);
  });

  it('lets the teammate and the celebration run on their own', () => {
    expect(segmentFor('partner', 0, true)).toMatchObject({
      auto: true,
      autoPace: 0.8,
      clock: true,
    });
    expect(segmentFor('celebrate', 7, false)).toMatchObject({ auto: true, clock: false });
  });
});

describe('coursePlan', () => {
  it('walks run, roxzone and workout eight times for singles', () => {
    const plan = coursePlan(false);
    expect(plan).toHaveLength(8 * 4 + 1);
    expect(plan.slice(0, 4).map((s) => [s.phase, s.mode])).toEqual([
      [0, 'run'],
      [1, 'enter'],
      [1, 'workout'],
      [1, 'exit'],
    ]);
    expect(plan.slice(-2).map((s) => [s.phase, s.mode])).toEqual([
      [15, 'finish'],
      [15, 'celebrate'],
    ]);
  });

  it('adds the handoff and the teammate half for doubles', () => {
    const plan = coursePlan(true);
    expect(plan).toHaveLength(8 * 6 + 1);
    expect(plan.slice(0, 6).map((s) => s.mode)).toEqual([
      'run',
      'enter',
      'workout',
      'handoff',
      'partner',
      'exit',
    ]);
  });
});
