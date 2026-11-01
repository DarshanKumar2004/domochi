import { describe, expect, it } from 'vitest';
import brand from '../../src/data/brand.json';
import { couponCode, earnsCoupon } from '../../src/systems/coupons';

describe('coupons for the real truck', () => {
  it('only for three-star days from the set day (and only when switched on)', () => {
    expect(earnsCoupon({ ...brand.coupons, enabled: false }, 99, 3)).toBe(false);
    const on = { ...brand.coupons, enabled: true };
    expect(earnsCoupon(on, on.fromDay - 1, 3)).toBe(false);
    expect(earnsCoupon(on, on.fromDay, 2)).toBe(false);
    expect(earnsCoupon(on, on.fromDay, 3)).toBe(true);
  });

  it('a code is the same for a day and player, and differs between players and days', () => {
    const a = couponCode(51, 'abc');
    expect(a).toMatch(/^DMC-51-[A-Z2-9]{4}$/);
    expect(couponCode(51, 'abc')).toBe(a);
    expect(couponCode(51, 'xyz')).not.toBe(a);
    expect(couponCode(52, 'abc')).not.toBe(a);
  });
});
