import { describe, expect, it } from 'vitest';
import { dailyGift, localDay } from '../../src/systems/daily';

const B = { gifts: [2, 3, 4, 5, 6, 8, 15] };
const at = (y: number, m: number, d: number, h = 10) => new Date(y, m - 1, d, h);

describe("mochi's daily gift", () => {
  it('first visit: day 1 of a streak', () => {
    expect(dailyGift(B, undefined, at(2026, 11, 2))).toEqual({ state: { last: '2026-11-02', streak: 1 }, cash: 2, streak: 1 });
  });

  it('once a day: a second visit the same day gets nothing', () => {
    const g = dailyGift(B, undefined, at(2026, 11, 2, 9))!;
    expect(dailyGift(B, g.state, at(2026, 11, 2, 23))).toBeNull();
  });

  it('days in a row build the streak (across a month end); the 7-day cycle starts again', () => {
    let s = dailyGift(B, undefined, at(2026, 10, 28))!.state;
    const cash: number[] = [];
    for (let d = 29; d <= 31; d++) {
      const g = dailyGift(B, s, at(2026, 10, d))!;
      s = g.state;
      cash.push(g.cash);
    }
    for (let d = 1; d <= 5; d++) {
      const g = dailyGift(B, s, at(2026, 11, d))!;
      s = g.state;
      cash.push(g.cash);
    }
    expect(s.streak).toBe(9);
    expect(cash).toEqual([3, 4, 5, 6, 8, 15, 2, 3]);
  });

  it('missing a day starts the count again', () => {
    const s = { last: '2026-11-01', streak: 5 };
    expect(dailyGift(B, s, at(2026, 11, 3))!.streak).toBe(1);
  });

  it('dates are local', () => {
    expect(localDay(at(2026, 1, 5, 0))).toBe('2026-01-05');
  });
});
