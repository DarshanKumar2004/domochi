import { describe, expect, it } from 'vitest';
import balanceJson from '../../src/data/balance.json';
import menuJson from '../../src/data/menu.json';
import type { Balance } from '../../src/systems/balance';
import type { Flavor, Menu, Topping } from '../../src/systems/menu';
import { ringBallCenters } from '../../src/stations/donutGeometry';
import type { GlazedDonut } from '../../src/stations/glaze';
import { ballAt, toppingQuality, toppingScoreFor, ToppingWork, type ToppingPiece } from '../../src/stations/toppings';

const balance = balanceJson as Balance;
const B = balance.toppings;
const ring = balance.glaze;
const menu = menuJson as Menu;
const flavor = (id: string) => menu.flavors.find((f) => f.id === id) as Flavor;
const topping = (id: string) => menu.toppings.find((t) => t.id === id) as Topping;
const glazed: GlazedDonut = { id: 1, fry: { id: 1, a: 1, b: 1, temperature: 1, score: 100 }, layers: [] };

function work(): ToppingWork {
  return new ToppingWork(glazed, menu, B, ring);
}

/** n pieces spread evenly round the ring. */
function sprinkleRing(w: ToppingWork, id: string, n: number): void {
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    w.add(id, Math.cos(a) * ring.ringRadius, Math.sin(a) * ring.ringRadius, k / n);
  }
}

describe('where a piece lands', () => {
  it('on a ball it sticks to that ball; in the hole or off the edge it falls off', () => {
    const balls = ringBallCenters(0, 0, ring.ringRadius);
    balls.forEach((p, k) => expect(ballAt(p.x, p.y, ring, B.onDonutMargin)).toBe(k));
    expect(ballAt(0, 0, ring, B.onDonutMargin)).toBe(-1);
    expect(ballAt(0.99, 0.99, ring, B.onDonutMargin)).toBe(-1);
  });

  it('pieces off the donut are kept (as mess) but not stuck on', () => {
    const w = work();
    expect(w.add('crushed-cookies', 0, 0, 0.5)!.on).toBe(false);
    expect(w.add('crushed-cookies', 0, -ring.ringRadius, 0.5)!.on).toBe(true);
    expect(w.countOn('crushed-cookies')).toBe(1);
    expect(w.pieces).toHaveLength(2);
  });

  it('unknown toppings and over-full donuts are refused', () => {
    const w = work();
    expect(w.add('sprinkles?', 0, 0, 0)).toBeNull();
    for (let i = 0; i < B.maxPieces; i++) w.add('crushed-cookies', 0, -0.65, 0);
    expect(w.full).toBe(true);
    expect(w.add('crushed-cookies', 0, -0.65, 0)).toBeNull();
  });
});

describe('scoring one topping', () => {
  const cookies = topping('crushed-cookies');

  it('the right amount spread over all 8 balls is perfect', () => {
    const w = work();
    sprinkleRing(w, cookies.id, 40);
    expect(toppingQuality(w.pieces, cookies, B)).toBeCloseTo(1);
  });

  it('too few, all on one ball, or way too many cost points', () => {
    const few = work();
    sprinkleRing(few, cookies.id, 8);
    expect(toppingQuality(few.pieces, cookies, B)).toBeCloseTo(8 / cookies.amount.min);

    const clumped = work();
    for (let i = 0; i < 40; i++) clumped.add(cookies.id, 0, -ring.ringRadius, i / 40);
    expect(toppingQuality(clumped.pieces, cookies, B)).toBeCloseTo(B.evennessFloor + (1 - B.evennessFloor) / 8);

    // Built directly: a donut can't hold this many (maxPieces).
    const heaps: ToppingPiece[] = Array.from({ length: Math.ceil(cookies.amount.max * B.tooMuchZeroAtFactor) }, (_, k) => ({
      toppingId: cookies.id,
      x: 0,
      y: 0,
      rot: 0,
      on: true,
      ball: k % 8,
    }));
    expect(toppingQuality(heaps, cookies, B)).toBe(0);
  });

  it('pieces falling off count against you', () => {
    const w = work();
    sprinkleRing(w, cookies.id, 40);
    for (let i = 0; i < 10; i++) w.add(cookies.id, 0, 0, 0);
    expect(toppingQuality(w.pieces, cookies, B)).toBeCloseTo(1 - 10 / 50 / B.messZeroAt);
  });

  it('one cookie butter cookie is perfect wherever it sits on the ring', () => {
    const w = work();
    w.add('cookie-butter-cookie', 0, -ring.ringRadius, 0.1);
    expect(toppingQuality(w.pieces, topping('cookie-butter-cookie'), B)).toBe(1);
  });
});

describe('toppingScoreFor: matching a donut to a flavour', () => {
  it('cookies & cream wants its crumbs; a plain donut scores 0 for it', () => {
    const w = work();
    sprinkleRing(w, 'crushed-cookies', 40);
    expect(toppingScoreFor(w.finish(), flavor('cookies-and-cream'), menu, B)).toBeCloseTo(1);
    expect(toppingScoreFor(glazed, flavor('cookies-and-cream'), menu, B)).toBe(0);
  });

  it('a flavour with no toppings wants none; each unwanted topping halves it', () => {
    expect(toppingScoreFor(glazed, flavor('strawberry'), menu, B)).toBe(1);
    const w = work();
    sprinkleRing(w, 'fruity-cereal', 30);
    expect(toppingScoreFor(w.finish(), flavor('strawberry'), menu, B)).toBe(B.unwantedFactor);
  });

  it('pieces that all fell off don\'t count as having that topping', () => {
    const pieces: ToppingPiece[] = [{ toppingId: 'fruity-cereal', x: 0, y: 0, rot: 0, on: false, ball: -1 }];
    expect(toppingScoreFor({ ...glazed, toppings: pieces }, flavor('strawberry'), menu, B)).toBe(1);
  });

  it('finish keeps the toppings and the donut; toppings already on stay when it comes back', () => {
    const w = work();
    sprinkleRing(w, 'crushed-cookies', 5);
    const d = w.finish();
    expect(d.id).toBe(1);
    expect(d.toppings).toHaveLength(5);
    expect(new ToppingWork(d, menu, B, ring).pieces).toHaveLength(5);
  });
});
