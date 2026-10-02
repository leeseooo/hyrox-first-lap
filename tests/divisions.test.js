import { describe, expect, it } from 'vitest';
import { divisions, makeProfile, stationLoad } from '../src/data/divisions.js';
import { stations } from '../src/data/stations.js';

describe('stations', () => {
  it('follows the official order of eight stations', () => {
    expect(stations.map((s) => s.en)).toEqual([
      'SKIERG',
      'SLED PUSH',
      'SLED PULL',
      'BURPEE BROAD JUMPS',
      'ROWING',
      'FARMERS CARRY',
      'SANDBAG LUNGES',
      'WALL BALLS',
    ]);
  });
});

describe('makeProfile', () => {
  it('supports all five Open divisions', () => {
    expect(divisions.map((d) => d.id)).toHaveLength(5);
    for (const { id } of divisions) expect(makeProfile(id).id).toBe(id);
  });

  it('gives mixed doubles partners the opposite wall-ball target', () => {
    const profile = makeProfile('mixed-doubles', 'female');
    expect(profile.targetHeight).toBe(2.7);
    expect(profile.partnerTargetHeight).toBe(3);
  });

  it('rejects unknown divisions', () => {
    expect(() => makeProfile('pro-single')).toThrow();
  });
});

describe('stationLoad', () => {
  it('describes sled weight including the sled', () => {
    expect(stationLoad(makeProfile('women-single'), 1)).toBe('102 kg · including sled');
  });

  it('is empty for unweighted stations', () => {
    expect(stationLoad(makeProfile('men-single'), 0)).toBe('');
  });
});
