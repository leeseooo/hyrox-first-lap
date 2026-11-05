import { describe, expect, it } from 'vitest';
import { RULES_VERSION } from '../src/race/pacing.js';
import {
  RACE_SCALE,
  formatRaceClock,
  formatRaceTime,
  loadBest,
  saveIfBest,
} from '../src/race/record.js';

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
  };
}
const brokenStorage = {
  getItem() {
    throw new Error('denied');
  },
  setItem() {
    throw new Error('denied');
  },
};
const result = (time) => ({
  time,
  blowups: 2,
  splits: [{ phase: 0, mode: 'run', t: 30 }],
  date: '2026-11-05',
});

describe('formatRaceClock', () => {
  it('scales game seconds to a real race time', () => {
    expect(RACE_SCALE).toBe(15);
    expect(formatRaceClock(0)).toBe('0:00:00');
    expect(formatRaceClock(4)).toBe('0:01:00');
    expect(formatRaceClock(338.4)).toBe('1:24:36');
    expect(formatRaceClock(400.7)).toBe('1:40:10');
  });

  it('drops partial seconds so the live clock never runs ahead', () => {
    expect(formatRaceClock(0.06)).toBe('0:00:00');
    expect(formatRaceClock(-3)).toBe('0:00:00');
  });
});

describe('formatRaceTime', () => {
  it('shows minutes, seconds and tenths', () => {
    expect(formatRaceTime(0)).toBe('0:00.0');
    expect(formatRaceTime(65.04)).toBe('1:05.0');
    expect(formatRaceTime(338.44)).toBe('5:38.4');
    expect(formatRaceTime(59.96)).toBe('1:00.0');
  });
});

describe('personal best', () => {
  it('saves the first finish', () => {
    const storage = memoryStorage();
    expect(saveIfBest(storage, 'men-single', result(340))).toEqual({
      isBest: true,
      previous: null,
    });
    expect(loadBest(storage, 'men-single')).toMatchObject({
      rules: RULES_VERSION,
      time: 340,
      blowups: 2,
    });
  });

  it('replaces only a faster finish', () => {
    const storage = memoryStorage();
    saveIfBest(storage, 'men-single', result(340));
    expect(saveIfBest(storage, 'men-single', result(350)).isBest).toBe(false);
    expect(loadBest(storage, 'men-single').time).toBe(340);
    expect(saveIfBest(storage, 'men-single', result(330)).isBest).toBe(true);
    expect(loadBest(storage, 'men-single').time).toBe(330);
  });

  it('keeps divisions apart', () => {
    const storage = memoryStorage();
    saveIfBest(storage, 'men-single', result(340));
    expect(loadBest(storage, 'women-single')).toBeNull();
  });

  it('ignores records from another rules version', () => {
    const storage = memoryStorage({
      'first-lap-best': JSON.stringify({ 'men-single': { rules: RULES_VERSION + 1, time: 100 } }),
    });
    expect(loadBest(storage, 'men-single')).toBeNull();
    expect(saveIfBest(storage, 'men-single', result(340)).isBest).toBe(true);
  });

  it('ignores corrupt data', () => {
    expect(loadBest(memoryStorage({ 'first-lap-best': '{not json' }), 'men-single')).toBeNull();
  });

  it('survives broken or missing storage', () => {
    expect(loadBest(brokenStorage, 'men-single')).toBeNull();
    expect(saveIfBest(brokenStorage, 'men-single', result(340))).toEqual({
      isBest: true,
      previous: null,
    });
    expect(loadBest(null, 'men-single')).toBeNull();
  });
});
