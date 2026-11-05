import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BACKGROUND, DOTS, LIGHT, PAINT } from '../src/race/palette.js';

const isColour = (c) => c.length === 3 && c.every((v) => v >= 0 && v <= 1);

describe('palette', () => {
  it('gives every material a face, edge, label and finish', () => {
    for (const [name, paint] of Object.entries(PAINT)) {
      expect(isColour(paint.face), name).toBe(true);
      expect(isColour(paint.edge), name).toBe(true);
      expect(isColour(paint.label), name).toBe(true);
      expect(paint.finish, name).toHaveLength(3);
    }
    expect(isColour(BACKGROUND)).toBe(true);
    expect(isColour(DOTS)).toBe(true);
  });

  it('keeps the light tones ordered from shadow to lit', () => {
    const [low, mid, high] = LIGHT.tones;
    expect(low).toBeLessThan(mid);
    expect(mid).toBeLessThan(high);
  });

  it('matches the arena background in CSS so the canvas never flashes', () => {
    const css = readFileSync(new URL('../src/styles/main.css', import.meta.url), 'utf8');
    const hex = css.match(/--scene:\s*#([0-9a-f]{6})/i)[1];
    const rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    expect(rgb).toEqual(BACKGROUND);
  });
});
