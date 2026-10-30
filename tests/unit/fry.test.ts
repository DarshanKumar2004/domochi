import { describe, expect, it } from 'vitest';
import balanceJson from '../../src/data/balance.json';
import type { Balance } from '../../src/systems/balance';
import { cookRateAt, Fryer, fryColor, sideScore, type FryBalance } from '../../src/stations/fry';

const B = (balanceJson as Balance).fry;

/** Run the fryer for `seconds` in small steps, like real frames. */
function run(f: Fryer, seconds: number, step = 1 / 60): void {
  for (let t = 0; t < seconds - 1e-9; t += step) f.tick(Math.min(step, seconds - t));
}

/** A fryer already sitting at a steady temperature. */
function hotFryer(tempF: number, over: Partial<FryBalance> = {}): Fryer {
  const f = new Fryer({ ...B, ...over, dropCoolPerDonutF: 0 });
  f.temp = tempF;
  f.setTarget(tempF);
  return f;
}

describe('oil temperature', () => {
  it('eases toward the dial setting without overshooting', () => {
    const f = new Fryer(B);
    f.temp = 300;
    f.setTarget(350);
    const seen: number[] = [];
    for (let i = 0; i < 20; i++) {
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

  it('dropping donuts and adding cold oil cool the vat', () => {
    const f = new Fryer(B);
    f.temp = 350;
    f.drop(1, 4);
    expect(f.temp).toBeCloseTo(350 - B.dropCoolPerDonutF * 4);
    const before = f.temp;
    expect(f.addOil()).toBe(true);
    expect(f.temp).toBeLessThan(before);
  });
});

describe('oil level', () => {
  it('each batch soaks up oil; topping up refills but never past full', () => {
    const f = new Fryer(B);
    f.drop(1, 5);
    expect(f.oil).toBeCloseTo(1 - B.oil.perDonut * 5);
    f.pull();
    f.addOil();
    expect(f.oil).toBe(1);
    expect(f.addOil()).toBe(false);
  });

  it('cannot drop with a batch already in, or with almost no oil', () => {
    const f = new Fryer(B);
    expect(f.drop(1, 2)).toBe(true);
    expect(f.drop(2, 2)).toBe(false);
    f.pull();
    f.oil = B.oil.minToFry / 2;
    expect(f.canDrop).toBe(false);
    expect(f.drop(3, 1)).toBe(false);
  });
});

describe('cooking', () => {
  it('cook rate is 0 when cold, 1 at the reference temp, capped when very hot', () => {
    expect(cookRateAt(B.cookRate.zeroAtF - 50, B)).toBe(0);
    expect(cookRateAt(B.cookRate.oneAtF, B)).toBeCloseTo(1);
    expect(cookRateAt(2000, B)).toBe(B.cookRate.max);
  });

  it('textbook fry: one side, flip, other side at ideal temp → near-perfect score', () => {
    const f = hotFryer(350);
    f.drop(1, 3);
    run(f, B.secondsPerSide);
    f.flip();
    run(f, B.secondsPerSide * 0.97); // the top already cooked a touch while floating
    const r = f.pull();
    expect(r.score).toBeGreaterThanOrEqual(95);
    expect(r.temperature).toBe(1);
    expect(r.evenness).toBeGreaterThan(0.95);
  });

  it('never flipping and never pressing the grate leaves the top raw', () => {
    const f = hotFryer(350);
    f.drop(1, 2);
    run(f, B.secondsPerSide);
    const r = f.pull();
    expect(Math.max(...r.sides.b)).toBeLessThan(0.2);
    expect(r.doneness).toBeLessThan(0.6);
  });

  it('holding the grate cooks the top side too', () => {
    const f = hotFryer(350);
    f.drop(1, 1);
    f.setGrate(true);
    run(f, 2);
    const top = f.batch!.up[0]!;
    expect(top).toBeCloseTo((2 / B.secondsPerSide) * B.topFactorGrate, 2);
  });

  it('leaving it in too long burns it', () => {
    const f = hotFryer(350);
    f.drop(1, 2);
    run(f, B.secondsPerSide * 2.2);
    f.flip();
    run(f, B.secondsPerSide * 2.2);
    expect(f.pull().score).toBeLessThan(10);
  });

  it('frying cold scores badly on temperature', () => {
    const f = hotFryer(300);
    f.drop(1, 2);
    run(f, 4);
    expect(f.pull().temperature).toBe(0);
  });

  it('low oil makes donuts uneven; full oil keeps them even', () => {
    const full = hotFryer(350);
    full.drop(1, 6);
    run(full, B.secondsPerSide);
    const evenFull = full.pull().evenness;

    const low = hotFryer(350);
    low.oil = B.oil.minToFry + 0.24; // ends below the low threshold after soaking
    low.drop(1, 6);
    run(low, B.secondsPerSide);
    const evenLow = low.pull().evenness;
    expect(evenFull).toBe(1);
    expect(evenLow).toBeLessThan(evenFull);
  });

  it('sides are reported by original side regardless of flips', () => {
    const f = hotFryer(350);
    f.drop(1, 1);
    run(f, 3);
    f.flip();
    f.flip();
    f.flip(); // odd flips: side A is now facing up
    const r = f.pull();
    expect(r.sides.a[0]!).toBeGreaterThan(r.sides.b[0]!);
  });

  it('pulling an empty fryer is an error', () => {
    expect(() => new Fryer(B).pull()).toThrow();
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
