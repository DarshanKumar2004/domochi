import { describe, expect, it } from 'vitest';
import balanceJson from '../../src/data/balance.json';
import customersJson from '../../src/data/customers.json';
import menuJson from '../../src/data/menu.json';
import type { Balance } from '../../src/systems/balance';
import type { CustomersData } from '../../src/systems/customers';
import { GameSession } from '../../src/systems/GameSession';
import { flavorsForDay, type Menu, type Stripe } from '../../src/systems/menu';
import { createRng } from '../../src/systems/rng';

const menu = menuJson as Menu;
const customers = customersJson as CustomersData;
const baseBalance = balanceJson as Balance;

function makeSession(over: Partial<Balance> = {}, day = 1, seed = 1): GameSession {
  // No active-customer cap unless a test asks for one; pacing has its own tests.
  return new GameSession({ menu, customers, balance: { ...baseBalance, maxActiveByDay: [99], ...over }, day, rng: createRng(seed) });
}

const fastSpawn = { spawn: { firstDelaySec: 1, intervalSec: { min: 2, max: 2 }, maxInLine: 3 } };

/** Take the front customer's order and send them to wait. */
function orderFront(s: GameSession) {
  const front = s.line[0]!;
  const ticket = s.takeOrder(front.id);
  s.finishOrdering(front.id);
  return { customer: front, ticket };
}

describe('GameSession: arrivals', () => {
  it('first customer arrives after firstDelaySec, not before', () => {
    const s = makeSession(fastSpawn);
    s.tick(999);
    expect(s.line).toHaveLength(0);
    s.tick(1);
    expect(s.line).toHaveLength(1);
  });

  it('spaces arrivals by the interval and caps the line', () => {
    const s = makeSession({ ...fastSpawn, customersPerDay: [10] });
    for (let t = 0; t < 30_000; t += 100) s.tick(100);
    expect(s.line).toHaveLength(3); // maxInLine
  });

  it('a new customer arrives as soon as the full line has room', () => {
    const s = makeSession({ ...fastSpawn, customersPerDay: [10] });
    for (let t = 0; t < 30_000; t += 100) s.tick(100);
    orderFront(s);
    s.tick(16);
    expect(s.line).toHaveLength(3);
  });

  it('stops after the day’s customer count', () => {
    const s = makeSession({ ...fastSpawn, customersPerDay: [2] });
    for (let t = 0; t < 10_000; t += 100) {
      s.tick(100);
      if (s.line[0]?.state === 'inLine') orderFront(s);
    }
    expect(s.waiting).toHaveLength(2);
    expect(s.line).toHaveLength(0);
  });

  it('emits changed when someone arrives', () => {
    const s = makeSession(fastSpawn);
    let changes = 0;
    s.events.on('changed', () => changes++);
    s.tick(1000);
    expect(changes).toBe(1);
  });
});

describe('GameSession: taking orders', () => {
  it('only the front customer can order; tickets count up from 1', () => {
    const s = makeSession({ ...fastSpawn, customersPerDay: [5] });
    s.tick(1000);
    s.tick(2000);
    const [first, second] = s.line;
    expect(() => s.takeOrder(second!.id)).toThrow();
    const t1 = s.takeOrder(first!.id);
    expect(t1.no).toBe(1);
    expect(s.customer(first!.id)!.state).toBe('ordering');
    expect(() => s.takeOrder(first!.id)).toThrow(); // already ordering
    s.finishOrdering(first!.id);
    expect(s.customer(first!.id)!.state).toBe('waiting');
    expect(s.takeOrder(second!.id).no).toBe(2);
  });

  it('orders use only flavors unlocked that day and the day’s size range', () => {
    const s = makeSession({ ...fastSpawn, customersPerDay: [30], spawn: { ...fastSpawn.spawn, maxInLine: 30 } }, 1, 9);
    const unlocked = flavorsForDay(menu, 1).map((f) => f.id);
    const { min, max } = baseBalance.orderSizeByDay[0]!;
    for (let i = 0; i < 30; i++) {
      s.tick(2000);
      const { ticket } = orderFront(s);
      expect(ticket.order.flavors.length).toBeGreaterThanOrEqual(min);
      expect(ticket.order.flavors.length).toBeLessThanOrEqual(max);
      for (const f of ticket.order.flavors) expect(unlocked).toContain(f);
      expect(ticket.line).not.toContain('{');
    }
  });

  it('the first ticket becomes active automatically; later ones do not steal it', () => {
    const s = makeSession({ ...fastSpawn, customersPerDay: [5] });
    s.tick(1000);
    s.tick(2000);
    orderFront(s);
    orderFront(s);
    expect(s.activeTicket?.no).toBe(1);
    expect(s.selectTicket(2)).toBe(true);
    expect(s.activeTicket?.no).toBe(2);
    expect(s.selectTicket(99)).toBe(false);
  });
});

describe('GameSession: customer pacing', () => {
  const paced = { ...fastSpawn, customersPerDay: [5], maxActiveByDay: [2], afterServeSec: { min: 3, max: 3 } };

  function serveFirstWaiting(s: GameSession) {
    const c = s.waiting[0]!;
    s.selectTicket(c.ticketNo!);
    s.serveActiveTicket();
  }

  it('only maxActive customers are here at once: customer 3 waits until someone is served', () => {
    const s = makeSession(paced);
    for (let t = 0; t < 20_000; t += 100) {
      s.tick(100);
      if (s.line[0]?.state === 'inLine') orderFront(s);
    }
    expect(s.activeCustomers).toBe(2);
    expect(s.waiting).toHaveLength(2);
  });

  it('after a serve, the next customer comes afterServeSec later, not instantly', () => {
    const s = makeSession(paced);
    for (let t = 0; t < 20_000; t += 100) {
      s.tick(100);
      if (s.line[0]?.state === 'inLine') orderFront(s);
    }
    serveFirstWaiting(s);
    expect(s.activeCustomers).toBe(1);
    s.tick(2900);
    expect(s.activeCustomers).toBe(1);
    s.tick(200);
    expect(s.activeCustomers).toBe(2);
  });
});

describe('GameSession: frying', () => {
  const fb = baseBalance.fry;

  it('the fryer heats up on the session clock', () => {
    const s = makeSession(fastSpawn);
    const before = s.fryer.temp;
    s.tick(2000);
    expect(s.fryer.temp).toBeGreaterThan(before);
  });

  it('drop, pull one, pull all: donuts land on the rack', () => {
    const s = makeSession(fastSpawn);
    for (let i = 0; i < 3; i++) expect(s.dropDonut()).toBe(i);
    s.tick(6000);
    expect(s.pullDonut(1)).not.toBeNull();
    expect(s.pullAll()).toEqual([0, 2]);
    expect(s.rack).toHaveLength(3);
  });

  it('the rack holds rackCapacity (6) and refuses more', () => {
    expect(fb.rackCapacity).toBe(6);
    const s = makeSession(fastSpawn);
    while (!s.rackFull) {
      s.fryer.oil = 1;
      s.dropDonut();
      s.tick(500);
      s.pullAll();
    }
    s.dropDonut();
    expect(s.pullDonut(0)).toBeNull();
    expect(s.rack).toHaveLength(fb.rackCapacity);
  });

  it('the whole rack can be trashed at once', () => {
    const s = makeSession(fastSpawn);
    for (let i = 0; i < 4; i++) s.dropDonut();
    s.tick(500);
    s.pullAll();
    expect(s.trashRack()).toBe(4);
    expect(s.rack).toHaveLength(0);
    expect(s.trashed).toBe(4);
    expect(s.trashRack()).toBe(0);
  });

  it('one rack donut can be trashed on its own', () => {
    const s = makeSession(fastSpawn);
    for (let i = 0; i < 3; i++) s.dropDonut();
    s.tick(500);
    s.pullAll();
    const keep = [s.rack[0]!.id, s.rack[2]!.id];
    expect(s.trashRackDonut(1)).toBe(true);
    expect(s.rack.map((d) => d.id)).toEqual(keep);
    expect(s.trashed).toBe(1);
  });

  it('burnt donuts are thrown out with a burnt event and counted', () => {
    const s = makeSession({ ...fastSpawn, customersPerDay: [1] });
    s.fryer.temp = 350;
    const burnt: number[][] = [];
    s.events.on('burnt', (e) => burnt.push(e.slots));
    s.dropDonut();
    for (let t = 0; t < (fb.secondsPerSide * fb.burntAt + 3) * 1000; t += 100) s.tick(100);
    expect(burnt).toEqual([[0]]);
    expect(s.trashed).toBe(1);
  });

  it('trashing a donut in the oil frees its slot', () => {
    const s = makeSession(fastSpawn);
    s.dropDonut();
    expect(s.trashDonut(0)).toBe(true);
    expect(s.fryer.count).toBe(0);
    expect(s.trashDonut(0)).toBe(false);
  });
});

/** Pour a careful ring of glaze (and optionally a zig-zag drizzle) on the board's donut. */
/** Glaze the donut on the board; a drizzle follows the flavour's stripes if given (else three across). */
function glazeBoard(s: GameSession, base: string, drizzle?: string, pattern?: readonly Stripe[]) {
  const w = s.glazeWork!;
  const R = baseBalance.glaze.ringRadius;
  for (const radius of [R - 0.14, R, R + 0.14]) {
    for (let k = 0; k < 48; k++) {
      const a0 = (k / 48) * Math.PI * 2;
      const a1 = ((k + 1) / 48) * Math.PI * 2;
      w.pour(base, Math.cos(a0) * radius, Math.sin(a0) * radius, Math.cos(a1) * radius, Math.sin(a1) * radius);
    }
  }
  if (drizzle && pattern) for (const p of pattern) w.pour(drizzle, p.x0, p.y0, p.x1, p.y1);
  // Three stripes across, kept on the donut.
  else if (drizzle) for (const y of [-0.6, 0, 0.6]) w.pour(drizzle, -Math.sqrt(0.64 - y * y), y, Math.sqrt(0.64 - y * y), y);
}

/** Fry n good donuts onto the rack. */
function fryRack(s: GameSession, n: number) {
  s.fryer.temp = 350;
  for (let i = 0; i < n; i++) s.dropDonut();
  for (let t = 0; t < baseBalance.fry.secondsPerSide * 1000; t += 100) s.tick(100);
  s.fryer.flipAll();
  for (let t = 0; t < baseBalance.fry.secondsPerSide * (1 - baseBalance.fry.topFactorFloating) * 1000; t += 100) s.tick(100);
  s.pullAll();
}

describe('GameSession: glazing', () => {
  it('rack donut → board → shelf, without needing an order', () => {
    const s = makeSession({ ...fastSpawn, customersPerDay: [1] });
    fryRack(s, 2);
    const id = s.rack[1]!.id;
    expect(s.startGlazing(1)?.id).toBe(id);
    expect(s.rack).toHaveLength(1);
    expect(s.finishGlazing()).toBeNull(); // nothing poured yet
    glazeBoard(s, 'strawberry');
    expect(s.finishGlazing()?.id).toBe(id);
    expect(s.glazeWork).toBeNull();
    expect(s.shelf.map((d) => d.id)).toEqual([id]);
  });

  it('two donuts fit on the glaze tray; a third waits on the rack', () => {
    const s = makeSession({ ...fastSpawn, customersPerDay: [1] });
    fryRack(s, 3);
    expect(s.startGlazing(0)).not.toBeNull();
    expect(s.startGlazing(0)).not.toBeNull();
    expect(s.startGlazing(0)).toBeNull();
    expect(s.glazeBoards.filter(Boolean)).toHaveLength(2);
    // Each spot finishes on its own.
    s.glazeBoards[1]!.pour('strawberry', -0.6, -0.65, 0.6, -0.65);
    expect(s.finishGlazing(0)).toBeNull(); // spot 0 has no glaze yet
    expect(s.finishGlazing(1)).not.toBeNull();
    expect(s.glazeBoards[1]).toBeNull();
    expect(s.glazeBoards[0]).not.toBeNull();
  });

  it('a glazed donut can come back from the shelf for more glaze, keeping what it had', () => {
    const s = makeSession({ ...fastSpawn, customersPerDay: [1] });
    fryRack(s, 1);
    s.startGlazing(0);
    glazeBoard(s, 'cookies-and-cream');
    const d = s.finishGlazing()!;
    s.startToppings(0);
    s.toppingWork!.add('crushed-cookies', 0, -0.65, 0.1);
    s.finishToppings();
    const w = s.reglaze(0)!;
    expect(w.id).toBe(d.id);
    expect(w.layers.map((l) => l.glazeId)).toEqual(['cookies-and-cream']);
    expect(s.shelf).toHaveLength(0);
    w.pour('cookies-and-cream', -0.5, 0.65, 0.5, 0.65); // touch up
    const again = s.finishGlazing()!;
    expect(again.layers).toHaveLength(1);
    expect((again as { toppings?: unknown[] }).toppings).toHaveLength(1);
  });

  it('redo trashes the donut on the board; shelf donuts can be trashed one by one', () => {
    const s = makeSession({ ...fastSpawn, customersPerDay: [1] });
    fryRack(s, 3);
    s.startGlazing(0);
    expect(s.trashGlazing()).toBe(true);
    expect(s.glazeWork).toBeNull();
    s.startGlazing(0);
    glazeBoard(s, 'strawberry');
    s.finishGlazing();
    s.startGlazing(0);
    glazeBoard(s, 'cookies-and-cream');
    s.finishGlazing();
    expect(s.trashShelfDonut(0)).toBe(true);
    expect(s.shelf).toHaveLength(1);
    expect(s.trashed).toBe(2);
  });

  it('the shelf has a capacity', () => {
    const s = makeSession({ ...fastSpawn, customersPerDay: [1], glaze: { ...baseBalance.glaze, shelfCapacity: 1 } });
    fryRack(s, 2);
    s.startGlazing(0);
    glazeBoard(s, 'strawberry');
    s.finishGlazing();
    expect(s.shelfFull).toBe(true);
    s.startGlazing(0);
    glazeBoard(s, 'strawberry');
    expect(s.finishGlazing()).toBeNull();
  });
});

/** Sprinkle a topping evenly round the ring, `n` pieces. */
function topBoard(s: GameSession, toppingId: string, n = 40) {
  const w = s.toppingWork!;
  const R = baseBalance.glaze.ringRadius;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    w.add(toppingId, Math.cos(a) * R, Math.sin(a) * R, k / n);
  }
}

/** Make a finished donut of a flavour onto the shelf (fry → glaze → toppings). */
function makeFlavor(s: GameSession, flavorId: string) {
  const f = menu.flavors.find((x) => x.id === flavorId)!;
  fryRack(s, 1);
  s.startGlazing(s.rack.length - 1);
  glazeBoard(s, f.glaze, f.drizzle, f.drizzlePattern);
  s.finishGlazing();
  if (f.toppings.length) {
    s.startToppings(s.shelf.length - 1);
    for (const t of f.toppings) topBoard(s, t, menu.toppings.find((x) => x.id === t)!.style === 'piece' ? 1 : 40);
    s.finishToppings();
  }
}

/** Box every ordered flavour from the shelf, in the ticket's order. */
function packInOrder(s: GameSession, flavors: readonly string[]) {
  flavors.forEach((id, slot) => {
    const i = s.shelf.findIndex((d) => s.flavorOf(d) === id);
    expect(s.boxDonut(i, slot)).toBe(slot);
  });
}

describe('GameSession: toppings', () => {
  it('shelf donut → toppings board → back on the shelf, with its toppings', () => {
    const s = makeSession({ ...fastSpawn, customersPerDay: [1] });
    fryRack(s, 1);
    s.startGlazing(0);
    glazeBoard(s, 'cookies-and-cream');
    s.finishGlazing();
    const id = s.shelf[0]!.id;
    expect(s.flavorOf(s.shelf[0]!)).toBeNull(); // no cookies on it yet
    expect(s.startToppings(0)?.donut.id).toBe(id);
    expect(s.shelf).toHaveLength(0);
    topBoard(s, 'crushed-cookies');
    expect(s.finishToppings()?.id).toBe(id);
    expect(s.toppingWork).toBeNull();
    expect(s.flavorOf(s.shelf[0]!)).toBe('cookies-and-cream');
  });

  it('the donut on the board keeps its shelf spot; redo trashes it', () => {
    const s = makeSession({ ...fastSpawn, customersPerDay: [1], glaze: { ...baseBalance.glaze, shelfCapacity: 1 } });
    makeFlavor(s, 'strawberry');
    s.startToppings(0);
    expect(s.shelfFull).toBe(true);
    expect(s.trashToppings()).toBe(true);
    expect(s.shelfFull).toBe(false);
    expect(s.trashed).toBe(1);
  });

  it('two donuts on the toppings tray: each spot works on its own; the third waits', () => {
    const s = makeSession({ ...fastSpawn, customersPerDay: [1] });
    makeFlavor(s, 'strawberry');
    makeFlavor(s, 'strawberry');
    makeFlavor(s, 'strawberry');
    expect(s.toppingBoards).toHaveLength(baseBalance.toppings.boards ?? 1);
    const a = s.startToppings(0)!;
    expect(s.activeToppingSpot).toBe(0);
    const b = s.startToppings(0)!;
    expect(s.activeToppingSpot).toBe(1);
    expect(s.toppingWork).toBe(b);
    expect(s.startToppings(0)).toBeNull(); // the tray is full
    expect(s.setActiveTopping(0)).toBe(true);
    expect(s.toppingWork).toBe(a);
    // Redo trashes the active one; Done (per spot) shelves the other.
    expect(s.trashToppings()).toBe(true);
    expect(s.toppingBoards[0]).toBeNull();
    expect(s.toppingWork).toBe(b);
    expect(s.finishToppings(1)?.id).toBe(b.donut.id);
    expect(s.toppingBoards.every((w) => !w)).toBe(true);
    expect(s.setActiveTopping(1)).toBe(false);
  });
});

describe('GameSession: box and serving', () => {
  it('pack in the ticket order and close the lid: the customer is served with full marks', () => {
    const s = makeSession({ ...fastSpawn, customersPerDay: [2] }, 1, 11);
    s.tick(1000);
    const { customer, ticket } = orderFront(s);
    for (const f of ticket.order.flavors) makeFlavor(s, f);
    expect(s.boxSize).toBe(3);
    packInOrder(s, ticket.order.flavors);
    expect(s.boxCount).toBe(ticket.order.flavors.length);
    let served = 0;
    s.events.on('served', () => served++);
    s.tick(4000);

    const e = s.serveActiveTicket();
    expect(served).toBe(1);
    expect(e.waitMs).toBeGreaterThanOrEqual(4000);
    expect(s.customer(customer.id)!.state).toBe('served');
    expect(ticket.status).toBe('served');
    const r = ticket.results;
    expect(r.box).toMatchObject({ score: 100, correct: ticket.order.flavors.length, extras: 0, empty: 0 });
    expect(r.missing).toBe(0);
    expect(r.glaze!.score).toBeGreaterThan(85);
    expect(r.toppings!.score).toBeGreaterThan(85);
    expect(r.fry!.score).toBeGreaterThan(80);
    expect(s.box).toHaveLength(0);
    expect(s.shelf).toHaveLength(0);

    // Phase 6: the order score, reaction, tip and sale.
    expect(r.score!.total).toBeGreaterThan(85);
    expect(['great', 'good']).toContain(r.score!.tier);
    expect(r.score!.wait).toBe(100); // 4 s is no wait at all
    expect(r.score!.tip).toBeGreaterThan(0);
    expect(e.score).toBe(r.score);
    expect(r.sale).toBeGreaterThan(0);
    const sum = s.summary();
    expect(sum).toMatchObject({ day: 1, served: 1, averageScore: r.score!.total, bestScore: r.score!.total, sales: r.sale, tips: r.score!.tip });
  });

  it("the day summary adds up every served order and counts thrown-away donuts", () => {
    const s = makeSession({ ...fastSpawn, customersPerDay: [2] }, 1, 5);
    s.tick(1000);
    s.tick(2000);
    orderFront(s);
    orderFront(s);
    s.dropDonut();
    s.pullAll();
    s.trashRackDonut(0);
    const a = s.serveActiveTicket(); // empty boxes: low scores, no tip
    const b = s.serveActiveTicket();
    const sum = s.summary();
    expect(sum.served).toBe(2);
    expect(sum.averageScore).toBe(Math.round((a.score.total + b.score.total) / 2));
    expect(sum.tips).toBeCloseTo(a.score.tip + b.score.tip);
    expect(sum.sales).toBeCloseTo(a.sale + b.sale);
    expect(sum.trashed).toBe(1);
    expect(sum.tiers.bad).toBe(2);
    expect(s.isDayComplete).toBe(true);
  });

  it('a donut can be moved between slots or taken back out', () => {
    const s = makeSession({ ...fastSpawn, customersPerDay: [2] }, 1, 11);
    s.tick(1000);
    orderFront(s);
    makeFlavor(s, 'strawberry');
    makeFlavor(s, 'cookies-and-cream');
    expect(s.boxDonut(0, 2)).toBe(2);
    expect(s.boxDonut(0, 2)).toBe(0); // taken: goes to the first free slot
    expect(s.moveBoxDonut(2, 0)).toBe(true); // swap
    expect(s.flavorOf(s.box[0]!)).toBe('strawberry');
    expect(s.unboxDonut(2)).toBe(true);
    expect(s.boxCount).toBe(1);
    expect(s.shelf).toHaveLength(1);
  });

  it('you can pick the box: a bigger one has room for gifts, which tip extra; a smaller one may not fit', () => {
    const s = makeSession({ ...fastSpawn, customersPerDay: [2], orderSizeByDay: [{ min: 2, max: 2 }] }, 1, 11);
    s.tick(1000);
    const { ticket } = orderFront(s);
    expect(s.boxChoice).toBe('trio');
    expect(s.chooseBox('nope')).toBe(false);
    expect(s.chooseBox('flight')).toBe(true);
    expect(s.boxSize).toBe(6);
    for (const f of [...ticket.order.flavors, 'strawberry']) makeFlavor(s, f);
    packInOrder(s, ticket.order.flavors);
    s.boxDonut(s.shelf.findIndex((d) => s.flavorOf(d) === 'strawberry'), 2); // the gift
    // Shrinking to a single: the overflow goes back to the shelf.
    s.chooseBox('single');
    expect(s.boxSize).toBe(1);
    expect(s.boxCount).toBe(1);
    // Back to the flight: refill slot 2 (the order's second donut) and slot 3 (the gift).
    s.chooseBox('flight');
    for (let i = 1; i < 3; i++) {
      const want = i < ticket.order.flavors.length ? ticket.order.flavors[i]! : 'strawberry';
      s.boxDonut(s.shelf.findIndex((d) => s.flavorOf(d) === want), i);
    }
    const e = s.serveActiveTicket();
    expect(ticket.results.box).toMatchObject({ score: 100, gifts: 1, extras: 0 });
    expect(e.score.gifts).toBe(1);
    expect(e.score.giftTip).toBeGreaterThan(0);
    expect(s.summary().gifts).toBe(1);
  });

  it('nothing can be boxed without an order selected', () => {
    const s = makeSession({ ...fastSpawn, customersPerDay: [1] });
    makeFlavor(s, 'strawberry');
    expect(s.boxSize).toBe(0);
    expect(s.boxDonut(0)).toBe(-1);
  });

  it('wrong slots and plain donuts cost box and toppings points; missing donuts score zero', () => {
    const s = makeSession({ ...fastSpawn, customersPerDay: [3], orderSizeByDay: [{ min: 2, max: 2 }] }, 1, 3);
    s.tick(1000);
    const { ticket } = orderFront(s);
    const [first, second] = ticket.order.flavors as [string, string];
    // Only the second flavour is made, and it goes in slot 1 (it belongs in slot 2).
    makeFlavor(s, second);
    s.boxDonut(0, 0);
    s.serveActiveTicket();
    const r = ticket.results;
    expect(r.missing).toBe(1);
    expect(r.box!.correct).toBe(first === second ? 1 : 0);
    expect(r.box!.score).toBeLessThan(100);
    expect(r.fry!.score).toBeLessThanOrEqual(50);
    expect(r.glaze!.score).toBeLessThanOrEqual(50);
  });

  it('picking a smaller box moves donuts past its end into free slots', () => {
    const s = makeSession({ ...fastSpawn, customersPerDay: [2], orderSizeByDay: [{ min: 4, max: 4 }] }, 1, 3);
    s.tick(1000);
    const a = orderFront(s);
    for (let i = 0; i < 2; i++) makeFlavor(s, 'strawberry');
    expect(s.boxSize).toBe(6);
    s.boxDonut(0, 5);
    s.boxDonut(0, 0);
    // A second order arrives; give it the trio box (as a smaller order would have) and select it.
    s.tick(5000);
    const b = orderFront(s);
    b.ticket.order.boxId = 'trio';
    s.selectTicket(b.ticket.no);
    expect(s.boxSize).toBe(3);
    expect(s.box.filter(Boolean)).toHaveLength(2);
    expect(s.box[1]).toBeDefined();
    expect(a.ticket.status).toBe('open');
  });

  it('serving moves the selection to the next open ticket and completes the day at the end', () => {
    const s = makeSession({ ...fastSpawn, customersPerDay: [2] }, 1, 5);
    s.tick(1000);
    s.tick(2000);
    const a = orderFront(s);
    const b = orderFront(s);
    let dayDone = 0;
    s.events.on('dayComplete', () => dayDone++);
    expect(s.activeTicket?.no).toBe(a.ticket.no);
    s.serveActiveTicket();
    expect(s.activeTicket?.no).toBe(b.ticket.no);
    s.serveActiveTicket();
    expect(s.activeTicket).toBeUndefined();
    expect(dayDone).toBe(1);
    expect(s.isDayComplete).toBe(true);
    expect(() => s.serveActiveTicket()).toThrow();
  });
});
