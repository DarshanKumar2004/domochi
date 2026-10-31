import { describe, expect, it } from 'vitest';
import balanceJson from '../../src/data/balance.json';
import menuJson from '../../src/data/menu.json';
import type { Balance } from '../../src/systems/balance';
import type { Menu } from '../../src/systems/menu';
import { orderPrice } from '../../src/systems/orders';
import { scoreOrder, tierFor, tipFor, tipMultiplier, validateScoring, waitScore } from '../../src/systems/score';

const B = (balanceJson as Balance).scoring;
const menu = menuJson as Menu;
const perfect = { fry: 100, glaze: 100, toppings: 100, box: 100 };

describe('wait score (a soft curve, not a cliff)', () => {
  it('is full marks for a reasonable wait, then slides smoothly to 0', () => {
    const patience = 100;
    expect(waitScore(0, patience, B)).toBe(100);
    expect(waitScore(patience * B.wait.graceShare, patience, B)).toBe(100);
    const mid = (B.wait.graceShare + B.wait.zeroShare) / 2;
    expect(waitScore(patience * mid, patience, B)).toBe(50);
    expect(waitScore(patience * B.wait.zeroShare, patience, B)).toBe(0);
    // Never rises with a longer wait, and no sudden drops.
    let last = 100;
    for (let t = 0; t <= patience * B.wait.zeroShare; t += 5) {
      const s = waitScore(t, patience, B);
      expect(s).toBeLessThanOrEqual(last);
      expect(last - s).toBeLessThan(10);
      last = s;
    }
  });

  it('a more patient customer gives you longer', () => {
    expect(waitScore(150, 120, B)).toBeGreaterThan(waitScore(150, 90, B));
  });
});

describe('order score, tiers and tips', () => {
  it('weights the stations (fry 30, glaze 25, toppings 25, box 10, wait 10)', () => {
    expect(B.weights).toEqual({ fry: 0.3, glaze: 0.25, toppings: 0.25, box: 0.1, wait: 0.1 });
    expect(scoreOrder(perfect, 0, 100, 3, B).total).toBe(100);
    // A burnt batch (fry 0) costs exactly the fry weight.
    expect(scoreOrder({ ...perfect, fry: 0 }, 0, 100, 3, B).total).toBe(70);
    // A very long wait only costs the wait weight.
    expect(scoreOrder(perfect, 10_000, 100, 3, B).total).toBe(90);
  });

  it('tiers come from the order score', () => {
    expect(tierFor(B.tiers.great, B)).toBe('great');
    expect(tierFor(B.tiers.great - 1, B)).toBe('good');
    expect(tierFor(B.tiers.okay, B)).toBe('okay');
    expect(tierFor(B.tiers.okay - 1, B)).toBe('bad');
    expect(scoreOrder(perfect, 0, 100, 1, B).tier).toBe('great');
  });

  it('tips follow the curve in balance.json, per donut, rounded to cents', () => {
    expect(tipMultiplier(0, B)).toBe(0);
    expect(tipMultiplier(100, B)).toBe(1.25);
    expect(tipMultiplier(80, B)).toBeCloseTo(0.85); // halfway between (70, 0.7) and (90, 1)
    expect(tipFor(100, 3, B)).toBeCloseTo(B.tip.perDonut * 3 * 1.25);
    expect(tipFor(30, 2, B)).toBeLessThan(tipFor(90, 2, B));
    expect(Number.isInteger(Math.round(tipFor(77, 3, B) * 100))).toBe(true);
  });

  it('the scoring numbers are valid, and bad ones are caught', () => {
    expect(validateScoring(B)).toEqual([]);
    expect(validateScoring({ ...B, tiers: { great: 50, good: 60, okay: 10 } })).toHaveLength(1);
    expect(validateScoring({ ...B, tip: { perDonut: 1, curve: [[50, 1], [10, 0]] } })).toHaveLength(1);
  });
});

describe('order price', () => {
  it('a full box sells at the box price; otherwise each donut at its own price', () => {
    expect(orderPrice(menu, { flavors: ['strawberry', 'strawberry', 'beignet'], boxId: 'trio' })).toBe(11);
    expect(orderPrice(menu, { flavors: ['strawberry', 'beignet'], boxId: 'trio' })).toBe(8);
    expect(orderPrice(menu, { flavors: Array(6).fill('strawberry'), boxId: 'flight' })).toBe(20);
  });
});

describe('gift donuts', () => {
  it("don't change the order score, but raise the reaction a level and add to the tip (up to a max)", () => {
    const plain = scoreOrder({ ...perfect, glaze: 60, toppings: 60 }, 0, 100, 3, B);
    const gifted = scoreOrder({ ...perfect, glaze: 60, toppings: 60 }, 0, 100, 3, B, 1);
    expect(gifted.total).toBe(plain.total);
    expect(plain.tier).toBe('good');
    expect(gifted.tier).toBe('great');
    expect(gifted.giftTip).toBe(B.gift.tipPerDonut);
    expect(gifted.tip).toBeCloseTo(plain.tip + B.gift.tipPerDonut);
    const lots = scoreOrder(perfect, 0, 100, 3, B, 10);
    expect(lots.giftTip).toBeCloseTo(B.gift.tipPerDonut * B.gift.max);
    expect(lots.tier).toBe('great'); // can't go above great
  });
});
