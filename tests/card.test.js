import { describe, expect, it } from 'vitest';
import { cardRows, drawCard, CARD } from '../src/race/card.js';
import { clockedPlan } from '../src/race/ghost.js';

const race = (doubles) => {
  let t = 0;
  return clockedPlan(doubles).map((segment) => (t += segment.length));
};

describe('cardRows', () => {
  it.each([false, true])('splits the race into eight stations (doubles %s)', (doubles) => {
    const times = race(doubles),
      rows = cardRows(times, doubles);
    expect(rows).toHaveLength(8);
    // Run 1 is 9 s; station 1 (SkiErg) adds the roxzone walk in and out.
    expect(rows[0].run).toBeCloseTo(9);
    expect(rows[0].station).toBeGreaterThan(8);
    const total = rows.reduce((sum, row) => sum + row.run + row.station, 0);
    expect(total).toBeCloseTo(times.at(-1));
  });

  it('returns nothing for splits that do not fit the course', () => {
    expect(cardRows([1, 2, 3], false)).toBeNull();
  });
});

// A 2D context stand-in that accepts every call, so drawing can run in Node.
function fakeContext() {
  const calls = [];
  const ctx = new Proxy(
    {},
    {
      get(target, key) {
        if (key in target) return target[key];
        if (key === 'measureText') return (text) => ({ width: String(text).length * 20 });
        if (key === 'calls') return calls;
        return (...args) => calls.push([key, ...args]);
      },
      set(target, key, value) {
        target[key] = value;
        return true;
      },
    },
  );
  return ctx;
}

describe('drawCard', () => {
  it('draws the time, the station rows and the site address', () => {
    const ctx = fakeContext(),
      times = race(false);
    drawCard(ctx, {
      time: times.at(-1),
      blowups: 2,
      division: 'Men Single',
      date: '2026-11-05',
      rows: cardRows(times, false),
      stations: Array.from({ length: 8 }, (_, i) => `Station ${i + 1}`),
      site: 'example.dev',
      tr: (text) => text,
    });
    const texts = ctx.calls.filter(([name]) => name === 'fillText').map(([, text]) => text);
    expect(texts).toContain('example.dev');
    expect(texts).toContain('Station 8');
    expect(texts.some((text) => /^\d+:\d{2}:\d{2}$/.test(text))).toBe(true);
    expect(ctx.calls.filter(([name]) => name === 'fillRect').length).toBeGreaterThan(16);
    expect(CARD).toEqual({ width: 1080, height: 1350 });
  });
});
