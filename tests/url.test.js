import { describe, expect, it } from 'vitest';
import { referrerOrigin, safeLocation } from '../src/analytics/url.js';

describe('safeLocation', () => {
  it('keeps well-formed UTM tags', () => {
    const href =
      'https://hyrox-first-lap.pages.dev/?utm_source=instagram&utm_medium=organic_social&utm_content=amb01_reel01';
    expect(safeLocation(href)).toBe(href);
  });

  it('drops other query parameters and the hash', () => {
    expect(safeLocation('https://example.dev/?email=a@b.c&internal=1&utm_source=x#top')).toBe(
      'https://example.dev/?utm_source=x',
    );
  });

  it('drops UTM values that could carry personal data', () => {
    expect(safeLocation('https://example.dev/?utm_source=kim%20minji%40mail.com')).toBe(
      'https://example.dev/',
    );
  });
});

describe('referrerOrigin', () => {
  it('reduces a referrer to its origin', () => {
    expect(referrerOrigin('https://l.instagram.com/?u=secret')).toBe('https://l.instagram.com');
  });

  it('returns an empty string for missing referrers', () => {
    expect(referrerOrigin('')).toBe('');
  });
});
