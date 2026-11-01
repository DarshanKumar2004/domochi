import { describe, expect, it } from 'vitest';
import { addWeeklyDay, weeklyFor, weeklyText } from '../../src/systems/weekly';

const B = { reward: 25, targets: { flavor: 10, great: 12, stars: 8, tidy: 3 } };
const day = (o: Partial<{ flavors: Record<string, number>; great: number; tidy: boolean; stars: number }> = {}) => ({ flavors: {}, great: 0, tidy: false, stars: 0, ...o });

describe('the weekly challenge', () => {
  it('one per week, kept through the week; a new week brings a new one', () => {
    const a = weeklyFor(B, 40, undefined, ['beignet', 'strawberry']);
    expect(weeklyFor(B, 40, { ...a, progress: 3 }, ['beignet']).progress).toBe(3);
    const b = weeklyFor(B, 41, { ...a, progress: 3 }, ['beignet']);
    expect(b.week).toBe(41);
    expect(b.progress).toBe(0);
  });

  it('a flavour challenge uses a flavour you have; every kind turns up over the weeks', () => {
    const kinds = new Set<string>();
    for (let w = 0; w < 60; w++) {
      const s = weeklyFor(B, w, undefined, ['beignet']);
      kinds.add(s.kind);
      if (s.kind === 'flavor') expect(s.flavor).toBe('beignet');
      expect(s.target).toBe(B.targets[s.kind]);
    }
    expect([...kinds].sort()).toEqual(['flavor', 'great', 'stars', 'tidy']);
  });

  it('days add up; it completes once (and stops counting)', () => {
    const s = { week: 1, kind: 'flavor' as const, flavor: 'beignet', target: 10, progress: 0, done: false };
    const one = addWeeklyDay(s, day({ flavors: { beignet: 6, strawberry: 9 } }));
    expect(one.state.progress).toBe(6);
    expect(one.justDone).toBe(false);
    const two = addWeeklyDay(one.state, day({ flavors: { beignet: 7 } }));
    expect(two.state).toMatchObject({ progress: 10, done: true });
    expect(two.justDone).toBe(true);
    expect(addWeeklyDay(two.state, day({ flavors: { beignet: 7 } })).justDone).toBe(false);
  });

  it('tidy counts days; stars and great reactions add up', () => {
    const tidy = { week: 1, kind: 'tidy' as const, target: 3, progress: 0, done: false };
    expect(addWeeklyDay(tidy, day({ tidy: true })).state.progress).toBe(1);
    const stars = { week: 1, kind: 'stars' as const, target: 8, progress: 0, done: false };
    expect(addWeeklyDay(stars, day({ stars: 3 })).state.progress).toBe(3);
  });

  it('reads nicely', () => {
    expect(weeklyText({ week: 1, kind: 'flavor', flavor: 'strawberry', target: 10, progress: 0, done: false }, (id) => id)).toBe('serve 10 strawberry donuts');
  });
});
