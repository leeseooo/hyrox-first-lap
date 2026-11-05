import { afterEach, describe, expect, it } from 'vitest';
import { setLocale, tr } from '../src/i18n/index.js';

describe('shared race result', () => {
  afterEach(() => setLocale('en'));

  it('keeps the race time in Korean', () => {
    setLocale('ko');
    expect(tr('I finished FIRST LAP with a race time of 1:24:36. Can you pace it better?')).toBe(
      'FIRST LAP 하이록스 체험을 대회 환산 1:24:36에 완주했어요. 페이스 조절, 더 잘할 수 있나요?',
    );
    expect(tr('We finished FIRST LAP with a race time of 1:21:04. Can you pace it better?')).toBe(
      '우리 팀이 FIRST LAP 하이록스 체험을 대회 환산 1:21:04에 완주했어요. 페이스 조절, 더 잘할 수 있나요?',
    );
  });

  it('keeps the ghost race times in Korean', () => {
    setLocale('ko');
    expect(tr("Race your friend's 1:24:30.")).toBe('친구의 1:24:30 기록에 도전해 보세요.');
    expect(tr('You beat your friend by 0:45.')).toBe('친구보다 0:45 빨랐어요.');
    expect(tr('Your friend was 1:02:10 faster.')).toBe('친구가 1:02:10 더 빨랐어요.');
  });
});
