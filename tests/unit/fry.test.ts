import { describe, expect, it } from 'vitest';
import balanceJson from '../../src/data/balance.json';
import type { Balance } from '../../src/systems/balance';
import { cookRateAt, Fryer, fryColor, fryResultFromDonuts, sideScore, type FryBalance } from '../../src/stations/fry';

const B = (balanceJson as Balance).fry;

/** Run the fryer for `seconds` in small steps, like real frames. */
function run(f: Fryer, seconds: number, step = 1 / 60): void {
  for (let t = 0; t < seconds - 1e-9; t += step) f.tick(Math.min(step, seconds - t));
}

/** A fryer sitting at a steady temperature, with no drop-cooling or oil drift to muddy the numbers. */
function hotFryer(tempF: number, over: Partial<FryBalance> = {}): Fryer {
  const f = new Fryer({ ...B, dropCoolPerDonutF: 0, oilDriftF: 0, ...over });
  f.temp = tempF;
  f.setTarget(tempF);
  return f;
}

describe('oil temperature', () => {
  it('eases toward the dial setting without overshooting', () => {
    const f = new Fryer({ ...B, oilDriftF: 0 });
    f.temp = 300;
    f.setTarget(350);
    const seen: number[] = [];
    for (let i = 0; i < 40; i++) {
      run(f, 0.5);
      seen.push(f.temp);
    }
    for (let i = 1; i < seen.length; i++) expect(seen[i]!).toBeGreaterThanOrEqual(seen[i - 1]!);
    expect(Math.max(...seen)).toBeLessThanOrEqual(350);
    expect(seen.at(-1)!).toBeGreaterThan(345);
  });

  it('is frame-rate independent', () => {
    const a = new Fryer(B);
    const b = new Fryer(B);
    run(a, 3, 1 / 30);
    run(b, 3, 1 / 144);
    expect(a.temp).toBeCloseTo(b.temp, 6);
  });

  it('clamps the dial to its range', () => {
    const f = new Fryer(B);
    f.setTarget(9999);
    expect(f.target).toBe(B.dial.maxF);
    f.setTarget(-5);
    expect(f.target).toBe(B.dial.minF);
  });

  it('less oil runs hotter at the same dial setting, so it must be dialled back down', () => {
    const f = new Fryer(B);
    f.setTarget(350);
    expect(f.settleTemp).toBe(350);
    f.oil = 0.5;
    expect(f.settleTemp).toBe(350 + B.oilDriftF * 0.5);
    run(f, 30);
    expect(f.inIdealRange).toBe(false);
    f.setTarget(350 - B.oilDriftF * 0.5);
    run(f, 30);
    expect(f.inIdealRange).toBe(true);
  });

  it('dropping a donut and adding cold oil cool the vat', () => {
    const f = new Fryer(B);
    f.temp = 350;
    f.drop();
    expect(f.temp).toBeCloseTo(350 - B.dropCoolPerDonutF);
    const before = f.temp;
    expect(f.addOil()).toBe(true);
    expect(f.temp).toBeLessThan(before);
  });
});

describe('slots and oil', () => {
  it('donuts go in one at a time, up to the number of slots', () => {
    const f = new Fryer(B);
    for (let i = 0; i < B.slots; i++) expect(f.drop()).toBe(i);
    expect(f.count).toBe(B.slots);
    expect(f.canDrop).toBe(false);
    expect(f.drop()).toBe(-1);
  });

  it('a freed slot is reused by the next drop', () => {
    const f = new Fryer(B);
    f.drop();
    f.drop();
    f.drop();
    f.trash(1);
    expect(f.drop()).toBe(1);
  });

  it('each donut soaks up oil; topping up refills but never past full', () => {
    const f = new Fryer(B);
    for (let i = 0; i < 5; i++) f.drop();
    expect(f.oil).toBeCloseTo(1 - B.oil.perDonut * 5);
    f.addOil();
    expect(f.oil).toBe(1);
    expect(f.addOil()).toBe(false);
  });

  it('cannot drop with almost no oil', () => {
    const f = new Fryer(B);
    f.oil = B.oil.minToFry / 2;
    expect(f.canDrop).toBe(false);
    expect(f.drop()).toBe(-1);
  });
});

describe('cooking a donut', () => {
  it('cook rate is 0 when cold, 1 at the reference temp, capped when very hot', () => {
    expect(cookRateAt(B.cookRate.zeroAtF - 50, B)).toBe(0);
    expect(cookRateAt(B.cookRate.oneAtF, B)).toBeCloseTo(1);
    expect(cookRateAt(2000, B)).toBe(B.cookRate.max);
  });

  it('textbook fry: one side, flip, other side at ideal temp → near-perfect score', () => {
    const f = hotFryer(350);
    const slot = f.drop();
    run(f, B.secondsPerSide);
    f.flip(slot);
    // The floating top already cooked a little, so the second side needs less time.
    run(f, B.secondsPerSide * (1 - B.topFactorFloating));
    const d = f.take(slot)!;
    expect(d.score).toBeGreaterThanOrEqual(95);
    expect(d.temperature).toBe(1);
  });

  it('floating tops creep along slowly; held under the grate, both sides fry at the same rate', () => {
    const floating = hotFryer(350);
    floating.drop();
    run(floating, 2);
    const pressed = hotFryer(350);
    pressed.drop();
    pressed.setGrate(true);
    run(pressed, 2);
    expect(floating.slots[0]!.up).toBeCloseTo((2 / B.secondsPerSide) * B.topFactorFloating, 2);
    expect(pressed.slots[0]!.up).toBeCloseTo((2 / B.secondsPerSide) * B.topFactorGrate, 2);
    expect(B.topFactorGrate).toBe(1);
    expect(pressed.slots[0]!.up).toBeCloseTo(pressed.slots[0]!.down, 5);
  });

  it('flipping one donut leaves the others alone', () => {
    const f = hotFryer(350);
    f.drop();
    f.drop();
    run(f, 3);
    f.flip(0);
    expect(f.slots[0]!.up).toBeGreaterThan(f.slots[1]!.up);
    expect(f.slots[0]!.flips).toBe(1);
    expect(f.slots[1]!.flips).toBe(0);
  });

  it('sides are reported by original side regardless of flips', () => {
    const f = hotFryer(350);
    f.drop();
    run(f, 3);
    f.flip(0);
    f.flip(0);
    f.flip(0); // odd flips: side A is now facing up
    const d = f.take(0)!;
    expect(d.a).toBeGreaterThan(d.b);
  });

  it('a donut left in burns and is thrown out automatically', () => {
    const f = hotFryer(350);
    f.drop();
    f.drop();
    run(f, 2);
    f.trash(1);
    run(f, B.secondsPerSide * B.burntAt + 1);
    expect(f.slots[0]).toBeNull();
    expect(f.burnt).toEqual([0]);
  });

  it('frying cold scores badly on temperature', () => {
    const f = hotFryer(300);
    f.drop();
    run(f, 4);
    expect(f.take(0)!.temperature).toBe(0);
  });

  it('taking, trashing or flipping an empty slot does nothing', () => {
    const f = new Fryer(B);
    expect(f.take(0)).toBeNull();
    expect(f.trash(0)).toBe(false);
    expect(f.flip(0)).toBe(false);
  });
});

describe('order results from rack donuts', () => {
  it('low oil fries unevenly from slot to slot, which shows up as uneven orders', () => {
    const fry = (oilAfterDrops: number) => {
      const f = hotFryer(350);
      f.oil = oilAfterDrops + B.oil.perDonut * 6;
      for (let i = 0; i < 6; i++) f.drop();
      run(f, B.secondsPerSide);
      f.flipAll();
      run(f, B.secondsPerSide * (1 - B.topFactorFloating));
      return fryResultFromDonuts(1, f.slots.map((_, i) => f.take(i)!), B);
    };
    const full = fry(0.95);
    const low = fry(B.oil.minToFry);
    expect(full.evenness).toBe(1);
    expect(low.evenness).toBeLessThan(full.evenness);
    expect(low.score).toBeLessThan(full.score);
  });

  it('an overdone set scores near zero even fried at a perfect temperature', () => {
    const r = fryResultFromDonuts(1, [{ id: 1, a: 1.7, b: 1.7, temperature: 1, score: 0 }], B);
    expect(r.score).toBeLessThan(5);
  });
});

describe('scoring helpers', () => {
  it('sideScore: perfect band, then linear to zero', () => {
    expect(sideScore(1, B)).toBe(1);
    expect(sideScore(1 + B.doneness.perfectWithin, B)).toBe(1);
    expect(sideScore(1 + B.doneness.zeroAt, B)).toBe(0);
    expect(sideScore(0, B)).toBe(0);
    const mid = sideScore(1 + (B.doneness.perfectWithin + B.doneness.zeroAt) / 2, B);
    expect(mid).toBeCloseTo(0.5);
  });

  it('fryColor gets darker as doneness rises', () => {
    const lum = (c: number) => ((c >> 16) & 0xff) * 0.3 + ((c >> 8) & 0xff) * 0.59 + (c & 0xff) * 0.11;
    let prev = Infinity;
    for (let d = 0; d <= 1.8; d += 0.1) {
      const l = lum(fryColor(d));
      expect(l).toBeLessThanOrEqual(prev + 1e-9);
      prev = l;
    }
  });
});
