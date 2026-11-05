import { afterEach, describe, expect, it } from 'vitest';
import { setLocale, tr } from '../src/i18n/index.js';

describe('shared race result', () => {
  afterEach(() => setLocale('en'));

  it('keeps the race time in Korean', () => {
    setLocale('ko');
    expect(tr('I finished FIRST LAP in 5:38.4. Can you pace it better?')).toBe(
      'FIRST LAP 하이록스 체험을 5:38.4에 완주했어요. 페이스 조절, 더 잘할 수 있나요?',
    );
    expect(tr('We finished FIRST LAP in 5:24.3. Can you pace it better?')).toBe(
      '우리 팀이 FIRST LAP 하이록스 체험을 5:24.3에 완주했어요. 페이스 조절, 더 잘할 수 있나요?',
    );
  });
});
