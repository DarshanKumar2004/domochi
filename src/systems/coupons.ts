// Real-shop coupons (switched on in brand.json once Ethan agrees on the
// offer): from a set day, a three-star day earns a code to show at the truck.
// Pure logic.

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** A coupon code for a day: DMC-<day>-<4 letters>, steady for that day and player. */
export function couponCode(day: number, playerId: string): string {
  let h = 2166136261 ^ day;
  for (let i = 0; i < playerId.length; i++) h = Math.imul(h ^ playerId.charCodeAt(i), 16777619);
  let s = '';
  for (let i = 0; i < 4; i++) {
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    s += LETTERS[(h >>> 0) % LETTERS.length];
  }
  return `DMC-${day}-${s}`;
}

/** Does this day earn a coupon? */
export function earnsCoupon(c: { enabled: boolean; fromDay: number }, day: number, stars: number): boolean {
  return c.enabled && day >= c.fromDay && stars >= 3;
}
