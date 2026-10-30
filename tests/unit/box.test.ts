import { describe, expect, it } from 'vitest';
import balanceJson from '../../src/data/balance.json';
import menuJson from '../../src/data/menu.json';
import type { Balance } from '../../src/systems/balance';
import type { Menu } from '../../src/systems/menu';
import { identifyFlavor, matchDonuts, scoreBox } from '../../src/stations/box';
import type { GlazeLayer } from '../../src/stations/glaze';
import type { FinishedDonut } from '../../src/stations/toppings';

const B = (balanceJson as Balance).box;
const menu = menuJson as Menu;

function layer(kind: 'base' | 'drizzle', glazeId: string): GlazeLayer {
  return { kind, glazeId, style: kind === 'base' ? 'dip' : 'drizzle', segments: [0, 0, 0, 0], coverage: 1, spill: 0, ballsTouched: 8 };
}

function donut(id: number, base: string, drizzle?: string, toppings: string[] = []): FinishedDonut {
  return {
    id,
    fry: { id, a: 1, b: 1, temperature: 1, score: 100 },
    layers: drizzle ? [layer('base', base), layer('drizzle', drizzle)] : [layer('base', base)],
    toppings: toppings.map((t) => ({ toppingId: t, x: 0, y: -0.65, rot: 0, on: true, ball: 0 })),
  };
}

describe('identifyFlavor', () => {
  it('recognises every menu flavour from its recipe', () => {
    for (const f of menu.flavors) expect(identifyFlavor(donut(1, f.glaze, f.drizzle, f.toppings), menu)).toBe(f.id);
  });

  it('a missing drizzle, a missing topping or an extra one makes it no flavour', () => {
    expect(identifyFlavor(donut(1, 'strawberry'), menu)).toBeNull();
    expect(identifyFlavor(donut(1, 'cookies-and-cream'), menu)).toBeNull();
    expect(identifyFlavor(donut(1, 'chocolate-hazelnut', undefined, ['fruity-cereal']), menu)).toBeNull();
  });
});

describe('scoreBox', () => {
  const order = ['strawberry', 'strawberry', 'beignet'];

  it('everything in its slot is 100', () => {
    expect(scoreBox(order, order, B)).toEqual({ score: 100, correct: 3, misplaced: 0, empty: 0, extras: 0 });
  });

  it('the right flavours in the wrong slots get partial credit', () => {
    const r = scoreBox(order, ['beignet', 'strawberry', 'strawberry'], B);
    expect(r).toMatchObject({ correct: 1, misplaced: 2 });
    expect(r.score).toBe(Math.round(((1 + 2 * B.wrongSpotCredit) / 3) * 100));
  });

  it('empty slots and unknown donuts score nothing; extras cost points', () => {
    expect(scoreBox(order, ['strawberry', undefined, null], B)).toMatchObject({ correct: 1, empty: 1, score: 33 });
    const extra = scoreBox(order, [...order, 'beignet'], B);
    expect(extra).toMatchObject({ extras: 1, score: Math.round((1 - B.extraPenalty) * 100) });
  });

  it('never goes below 0', () => {
    expect(scoreBox(['beignet'], [undefined, 'beignet', 'beignet', 'beignet', 'beignet', 'beignet'], B).score).toBe(0);
  });
});

describe('matchDonuts', () => {
  it('right-slot donuts keep their slot; others go to the best remaining flavour', () => {
    const d = [donut(1, 'strawberry', 'white-icing'), donut(2, 'powdered-sugar'), donut(3, 'strawberry')];
    const ids = d.map((x) => identifyFlavor(x, menu));
    // Quality: 1 if the base glaze matches the flavour's, else 0.
    const q = (x: FinishedDonut, f: string) => (x.layers[0]!.glazeId === menu.flavors.find((m) => m.id === f)!.glaze ? 1 : 0);
    expect(matchDonuts(['strawberry', 'strawberry', 'beignet'], d, ids, q)).toEqual([0, 2, 1]);
  });

  it('ordered flavours with nothing left get -1', () => {
    expect(matchDonuts(['beignet', 'beignet'], [donut(1, 'powdered-sugar')], ['beignet'], () => 1)).toEqual([0, -1]);
  });
});
