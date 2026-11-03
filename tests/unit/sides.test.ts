import { describe, expect, it } from 'vitest';
import balanceJson from '../../src/data/balance.json';
import customersJson from '../../src/data/customers.json';
import menuJson from '../../src/data/menu.json';
import { validateBalance, type Balance } from '../../src/systems/balance';
import type { CustomersData } from '../../src/systems/customers';
import { GameSession } from '../../src/systems/GameSession';
import type { Menu } from '../../src/systems/menu';
import { describeOrder, generateOrder, itemCount, orderPrice, type Order } from '../../src/systems/orders';
import { createRng } from '../../src/systems/rng';
import { scoreOrder } from '../../src/systems/score';
import { Bakery, kolacheScore, type Kolache } from '../../src/stations/kolache';
import { RiceStation, onigiriScore, riceQuality, shapeScore } from '../../src/stations/onigiri';
import { identifySide, matchSides, rangeScore, sideBoxFor, sideItemsForDay, validateSides } from '../../src/stations/sides';

const menu = menuJson as Menu;
const balance = balanceJson as Balance;
const sides = menu.sides!;
const bake = balance.bake;
const rice = balance.rice;

/** A perfect raw kolache of an item on the pan, ready for the oven. */
function perfectKolache(b: Bakery, slot: number, itemId: string): void {
  const item = sides.kolache.items.find((i) => i.id === itemId)!;
  b.placeDough(slot);
  b.setFilling(slot, item.filling);
  b.addFill(slot, 1 / bake.fill.perSec);
  b.addShape(slot, 1 / bake.shape.perSec);
  for (const t of item.toppings) {
    const want = sides.kolache.toppings.find((x) => x.id === t)!.amount.min;
    for (let i = 0; i < want; i++) b.addTopping(slot, t);
  }
  b.addWash(slot, 1);
}

/** Run the bakery for `sec` seconds in small steps. */
function run(b: Bakery | RiceStation, sec: number): void {
  for (let t = 0; t < sec; t += 0.05) b.tick(0.05);
}

describe('sides data', () => {
  it('menu sides and balance are valid', () => {
    expect(validateSides(sides)).toEqual([]);
    expect(validateBalance(balance)).toEqual([]);
  });

  it('unlock over the days, kolaches before onigiri, none on day 1', () => {
    expect(sideItemsForDay(sides.kolache, 1)).toHaveLength(0);
    expect(sideItemsForDay(sides.onigiri, 1)).toHaveLength(0);
    const firstK = Math.min(...sides.kolache.items.map((i) => i.unlockDay));
    const firstO = Math.min(...sides.onigiri.items.map((i) => i.unlockDay));
    expect(firstK).toBeLessThan(firstO);
    expect(sideItemsForDay(sides.kolache, 99)).toHaveLength(sides.kolache.items.length);
  });

  it('every filling and side topping has a supply to buy, unlocking with its first item', () => {
    for (const kind of ['kolache', 'onigiri'] as const) {
      for (const item of sides[kind].items) {
        const f = balance.supplies.items.find((s) => s.id === `filling-${item.filling}`);
        expect(f, item.filling).toBeDefined();
        expect(f!.unlockDay).toBeLessThanOrEqual(item.unlockDay);
        for (const t of item.toppings) expect(balance.supplies.items.some((s) => s.id === `side-topping-${t}`), t).toBe(true);
      }
      for (const box of sides[kind].boxes) expect(balance.supplies.items.some((s) => s.id === `box-${box.id}`), box.id).toBe(true);
    }
  });

  it('picks the smallest box that fits', () => {
    expect(sideBoxFor(sides.kolache, 1).id).toBe('kolache-bag');
    expect(sideBoxFor(sides.kolache, 3).id).toBe('kolache-box');
  });

  it('rangeScore is 1 inside and falls to 0 at zeroAt', () => {
    expect(rangeScore(1, { min: 0.8, max: 1.2 }, 0.5)).toBe(1);
    expect(rangeScore(1.45, { min: 0.8, max: 1.2 }, 0.5)).toBeCloseTo(0.5);
    expect(rangeScore(0, { min: 0.8, max: 1.2 }, 0.5)).toBe(0);
  });

  it('identifies an item by filling and toppings', () => {
    expect(identifySide(sides.kolache, 'maple-bacon', {})?.id).toBe('maple-bacon-kolache');
    expect(identifySide(sides.onigiri, 'tuna', {})?.id).toBe('tuna-onigiri');
    expect(identifySide(sides.kolache, null, {})).toBeNull();
  });

  it('matches packed items to the ordered ones, best first', () => {
    const m = matchSides(['a', 'b'], ['b', 'a'], (p, id) => (p === id ? 1 : 0));
    expect(m).toEqual([1, 0]);
    expect(matchSides(['a', 'a'], ['a'], () => 1)).toEqual([0, -1]);
  });
});

describe('Bakery (kolaches)', () => {
  it('proofs on the pan, then bakes golden at the ideal temperature and scores near full marks', () => {
    const b = new Bakery(bake);
    b.temp = 375;
    perfectKolache(b, 0, 'jalapeno-cheddar-sausage-kolache');
    run(b, 1 / bake.proof.perSec); // proof → 1
    expect(b.pan[0]!.proof).toBeCloseTo(1, 1);
    expect(b.ovenIn()).toBe(true);
    b.temp = 375;
    b.setTarget(375);
    run(b, bake.oven.secondsToGolden);
    expect(b.pan[0]!.baked).toBeGreaterThan(0.9);
    expect(b.ovenOut()).toBe(true);
    const k = b.rack[0]!;
    const item = sides.kolache.items.find((i) => i.id === 'jalapeno-cheddar-sausage-kolache')!;
    expect(kolacheScore(k, item, sides.kolache, bake)).toBeGreaterThan(0.9);
  });

  it('proof stops in the oven', () => {
    const b = new Bakery(bake);
    perfectKolache(b, 0, 'jalapeno-cheddar-sausage-kolache');
    run(b, 5);
    const p = b.pan[0]!.proof;
    b.ovenIn();
    run(b, 3);
    expect(b.pan[0]!.proof).toBe(p);
  });

  it('can’t be worked on in the oven', () => {
    const b = new Bakery(bake);
    b.placeDough(0);
    b.ovenIn();
    expect(b.placeDough()).toBe(-1);
    expect(b.addFill(0, 1)).toBe(false);
    expect(b.addWash(0, 1)).toBe(false);
  });

  it('burns if left in, and is thrown out', () => {
    const b = new Bakery(bake);
    b.temp = 450;
    b.setTarget(450);
    b.placeDough(0);
    b.ovenIn();
    run(b, 60);
    expect(b.pan[0]).toBeNull();
    expect(b.burnt).toEqual([0]);
    expect(b.inOven).toBe(false);
  });

  it('scores the wrong filling 0 and under-baked low', () => {
    const k: Kolache = { id: 1, filling: 'maple-bacon', fill: 1, shape: 1, wash: 1, proof: 1, toppings: {}, baked: 1, bakeSec: 10, inRangeSec: 10 };
    const sausage = sides.kolache.items.find((i) => i.id === 'jalapeno-cheddar-sausage-kolache')!;
    expect(kolacheScore(k, sausage, sides.kolache, bake)).toBe(0);
    const pale = { ...k, filling: 'jalapeno-cheddar-sausage', baked: 0.3 };
    expect(kolacheScore(pale, sausage, sides.kolache, bake)).toBeLessThan(0.75);
  });

  it('won’t take the pan out onto a full rack', () => {
    const b = new Bakery({ ...bake, rackCapacity: 1 });
    b.placeDough(0);
    b.placeDough(1);
    b.ovenIn();
    expect(b.ovenOut()).toBe(false);
  });
});

describe('RiceStation (onigiri)', () => {
  it('cooks a pot, then makes a well-made onigiri that scores near full marks', () => {
    const r = new RiceStation(rice);
    expect(r.scoop(1)).toBe(false); // no rice yet
    expect(r.startCooker(0.5)).toBe(true);
    run(r, rice.cooker.cookSec + 0.1);
    expect(r.cooker).toBe('ready');
    expect(r.portions).toBe(rice.cooker.portions);
    r.scoop(1 / rice.scoop.perSec);
    expect(r.portions).toBe(rice.cooker.portions - 1);
    r.setFilling('tuna', 0.05);
    for (let i = 0; i < rice.press.count; i++) r.press(0.4);
    r.wrapNori(0.02);
    const o = r.finish()!;
    const item = sides.onigiri.items.find((i) => i.id === 'tuna-onigiri')!;
    expect(onigiriScore(o, item, sides.onigiri, rice)).toBeGreaterThan(0.95);
  });

  it('water off the line makes worse rice', () => {
    expect(riceQuality(0.5, rice)).toBe(1);
    expect(riceQuality(0.1, rice)).toBeLessThan(0.7);
  });

  it('shape: too few, too long or extra presses score less', () => {
    expect(shapeScore([0.4, 0.4, 0.4], rice)).toBe(1);
    expect(shapeScore([0.4], rice)).toBeCloseTo(1 / 3);
    expect(shapeScore([2, 2, 2], rice)).toBe(0);
    expect(shapeScore([0.4, 0.4, 0.4, 0.4], rice)).toBeCloseTo(rice.press.extraFactor);
  });

  it('no nori, or the wrong filling, costs', () => {
    const base = { id: 1, rice: 1, quality: 1, filling: 'tuna', fillOffset: 0, presses: [0.4, 0.4, 0.4], toppings: {}, nori: 0 };
    const item = sides.onigiri.items.find((i) => i.id === 'tuna-onigiri')!;
    expect(onigiriScore({ ...base, nori: null }, item, sides.onigiri, rice)).toBeLessThan(0.9);
    expect(onigiriScore({ ...base, filling: 'maple-bacon' }, item, sides.onigiri, rice)).toBe(0);
  });

  it('the pot empties as it’s used and can be cooked again', () => {
    const r = new RiceStation({ ...rice, cooker: { ...rice.cooker, portions: 1 } });
    r.startCooker(0.5);
    run(r, rice.cooker.cookSec + 0.1);
    r.scoop(0.5);
    expect(r.cooker).toBe('empty');
    expect(r.startCooker(0.5)).toBe(true);
  });
});

describe('orders with sides', () => {
  it('only add kolaches and onigiri once they are on the menu', () => {
    const rng = createRng(3);
    for (let i = 0; i < 50; i++) {
      const o = generateOrder(menu, 5, { min: 1, max: 3 }, [], 1, rng, { balance: balance.sides });
      expect(o.kolaches).toBeUndefined();
      expect(o.onigiri).toBeUndefined();
    }
  });

  it('sometimes include them later, from the unlocked items', () => {
    const rng = createRng(4);
    let k = 0;
    let o = 0;
    for (let i = 0; i < 200; i++) {
      const order = generateOrder(menu, 12, { min: 1, max: 3 }, [], 1, rng, { balance: balance.sides });
      if (order.kolaches) {
        k++;
        for (const id of order.kolaches) expect(id).toBe('jalapeno-cheddar-sausage-kolache');
      }
      if (order.onigiri) o++;
      expect(order.flavors.length).toBeGreaterThan(0);
    }
    expect(k).toBeGreaterThan(40);
    expect(o).toBeGreaterThan(40);
    expect(k).toBeLessThan(160);
  });

  it('are priced one by one and spoken naturally', () => {
    const order: Order = { flavors: ['strawberry'], boxId: 'single', kolaches: ['jalapeno-cheddar-sausage-kolache', 'jalapeno-cheddar-sausage-kolache'], onigiri: ['tuna-onigiri'] };
    expect(orderPrice(menu, order)).toBeCloseTo(4 + 3.5 * 2 + 4);
    expect(itemCount(order)).toBe(4);
    expect(describeOrder(menu, order)).toBe('a strawberry, two jalapeno cheddar sausage kolaches and a tuna onigiri');
  });
});

describe('scoreOrder with sides', () => {
  const stations = { fry: 100, glaze: 100, toppings: 100, box: 100 };
  it('is unchanged without sides', () => {
    const a = scoreOrder(stations, 0, 60, 2, balance.scoring);
    expect(a.total).toBe(100);
  });
  it('mixes the sides in by item count, and tips per item', () => {
    const s = scoreOrder(stations, 0, 60, 1, balance.scoring, 0, [{ score: 0, count: 1 }]);
    // Half the items scored 0: the making part halves, the wait still counts.
    expect(s.total).toBe(Math.round((50 * 0.9 + 100 * 0.1) / 1));
    const t1 = scoreOrder(stations, 0, 60, 1, balance.scoring);
    const t2 = scoreOrder(stations, 0, 60, 1, balance.scoring, 0, [{ score: 100, count: 1 }]);
    expect(t2.tip).toBeCloseTo(t1.tip * 2);
  });
});

describe('GameSession: kolaches and onigiri', () => {
  const customers = customersJson as CustomersData;
  const order: Order = { flavors: ['beignet'], boxId: 'single', kolaches: ['jalapeno-cheddar-sausage-kolache'], onigiri: ['tuna-onigiri'] };

  function session(): GameSession {
    const s = new GameSession({ menu, customers, balance: { ...balance, maxActiveByDay: [99] }, day: 12, rng: createRng(1), script: { orders: [order] } });
    for (let i = 0; i < 40 && !s.line.length; i++) s.tick(100);
    const c = s.line[0]!;
    s.takeOrder(c.id);
    s.finishOrdering(c.id);
    return s;
  }

  it('packs a kolache box and an onigiri pack for the order, and they count when served', () => {
    const s = session();
    expect(s.sidesToPack).toEqual(['kolache', 'onigiri']);
    // Kolache: make, bake, pack.
    s.bakery.temp = 375;
    perfectKolache(s.bakery, 0, 'jalapeno-cheddar-sausage-kolache');
    for (let i = 0; i < 150; i++) s.tick(100); // proof ~1
    expect(s.ovenIn()).toBe(true);
    s.bakery.temp = 375;
    for (let i = 0; i < 160; i++) s.tick(100);
    expect(s.ovenOut()).toBe(true);
    expect(s.sideBoxChoice('kolache')?.id).toBe('kolache-bag');
    expect(s.packSide('kolache', 0)).toBe(0);
    expect(s.closeSideBox('kolache')).toBe(true);
    expect(s.sidesToPack).toEqual(['onigiri']);
    // Onigiri: cook, make, pack.
    expect(s.startRice(0.5)).toBe('ok');
    for (let i = 0; i < 210; i++) s.tick(100);
    s.scoopRice(1 / rice.scoop.perSec);
    expect(s.setOnigiriFilling('tuna', 0)).toBe('ok');
    for (let i = 0; i < 3; i++) s.pressOnigiri(0.4);
    expect(s.wrapNori(0)).toBe('ok');
    expect(s.finishOnigiri()).not.toBeNull();
    expect(s.packSide('onigiri', 0)).toBe(0);
    expect(s.closeSideBox('onigiri')).toBe(true);
    expect(s.sidesToPack).toEqual([]);
    // The donut: fry it roughly and box it; serve.
    s.dropDonut();
    s.pullAll();
    const w = s.startToppingsFromRack(0)!;
    expect(w).not.toBeNull();
    s.finishToppings();
    s.boxDonut(0);
    const served = s.serveActiveTicket();
    const sd = served.ticket.results.sides!;
    expect(sd.kolache!.score).toBeGreaterThan(85);
    expect(sd.onigiri!.score).toBeGreaterThan(90);
    expect(sd.kolache!.missing).toBe(0);
    expect(served.ticket.results.price).toBeCloseTo(4 + 3.5 + 4);
  });

  it('sides not packed score 0 for those items', () => {
    const s = session();
    s.dropDonut();
    s.pullAll();
    s.startToppingsFromRack(0);
    s.finishToppings();
    s.boxDonut(0);
    const served = s.serveActiveTicket();
    expect(served.ticket.results.sides!.kolache).toEqual({ score: 0, count: 1, missing: 1 });
  });

  it('an open box goes back to the rack when the order is served or changed', () => {
    const s = session();
    s.bakery.placeDough(0);
    s.ovenIn();
    s.tick(100);
    s.ovenOut();
    s.packSide('kolache', 0);
    expect(s.sideBoxOf('kolache')).toHaveLength(1);
    s.boxDonut(0);
    s.dropDonut();
    s.pullAll();
    s.startToppingsFromRack(0);
    s.finishToppings();
    s.boxDonut(0);
    s.serveActiveTicket();
    expect(s.sideBoxOf('kolache')).toHaveLength(0);
    expect(s.bakery.rack).toHaveLength(1);
  });

  it('uses stock for dough, fillings and nori, and says when it’s out', () => {
    const stock = Object.fromEntries(balance.supplies.items.map((i) => [i.id, 0]));
    stock['kolache-dough'] = 1;
    const s = new GameSession({ menu, customers, balance, day: 12, rng: createRng(1), stock });
    expect(s.placeKolache()).toBe(0);
    expect(s.placeKolache()).toBe(-1);
    expect(s.setKolacheFilling(0, 'jalapeno-cheddar-sausage')).toBe('none');
    expect(s.startRice(0.5)).toBe('none');
  });

  it('keeps the oven and the rice pot through a reload', () => {
    const s = session();
    s.bakery.setTarget(400);
    s.startRice(0.5);
    s.tick(5000);
    const snap = JSON.parse(JSON.stringify(s.snapshot()));
    const t = new GameSession({ menu, customers, balance, day: 12, rng: createRng(1), script: { orders: [order] } });
    t.restore(snap);
    expect(t.bakery.target).toBe(400);
    expect(t.riceStation.cooker).toBe('cooking');
    expect(t.riceStation.cookLeft).toBeCloseTo(s.riceStation.cookLeft);
  });
});
