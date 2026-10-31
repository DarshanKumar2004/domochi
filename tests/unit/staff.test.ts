import { describe, expect, it } from 'vitest';
import balanceJson from '../../src/data/balance.json';
import type { Balance } from '../../src/systems/balance';
import { awayEarnings, crewCap } from '../../src/systems/staff';

const S = (balanceJson as Balance).staff;

describe('your crew, while you are away', () => {
  it('nobody hired, or only a moment away: nothing', () => {
    expect(awayEarnings(S, [], 10)).toBe(0);
    expect(awayEarnings(S, ['mai'], S.minHours / 2)).toBe(0);
  });

  it('grows with time away but levels off below the cap (not linear)', () => {
    const cap = crewCap(S, ['mai']);
    const at = (h: number) => awayEarnings(S, ['mai'], h);
    expect(at(S.halfLifeHours)).toBeCloseTo(cap / 2, 1);
    expect(at(2 * S.halfLifeHours)).toBeCloseTo(cap * 0.75, 1);
    // Doubling the time away is worth far less than double.
    expect(at(48)).toBeLessThan(at(24) * 1.2);
    expect(at(1000)).toBeLessThanOrEqual(cap);
  });

  it('each hire raises the cap', () => {
    expect(crewCap(S, ['mai', 'theo'])).toBeGreaterThan(crewCap(S, ['mai']));
    expect(awayEarnings(S, ['mai', 'theo'], 12)).toBeGreaterThan(awayEarnings(S, ['mai'], 12));
  });
});
