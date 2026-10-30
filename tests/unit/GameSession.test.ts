import { describe, expect, it } from 'vitest';
import balanceJson from '../../src/data/balance.json';
import customersJson from '../../src/data/customers.json';
import menuJson from '../../src/data/menu.json';
import type { Balance } from '../../src/systems/balance';
import type { CustomersData } from '../../src/systems/customers';
import { GameSession } from '../../src/systems/GameSession';
import { flavorsForDay, type Menu } from '../../src/systems/menu';
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
function glazeBoard(s: GameSession, base: string, drizzle?: string) {
  const w = s.glazeWork!;
  const R = baseBalance.glaze.ringRadius;
  for (const radius of [R - 0.14, R, R + 0.14]) {
    for (let k = 0; k < 48; k++) {
      const a0 = (k / 48) * Math.PI * 2;
      const a1 = ((k + 1) / 48) * Math.PI * 2;
      w.pour(base, Math.cos(a0) * radius, Math.sin(a0) * radius, Math.cos(a1) * radius, Math.sin(a1) * radius);
    }
  }
  if (drizzle) for (let k = 0; k < 7; k++) w.pour(drizzle, -0.85, -0.8 + (1.6 * k) / 6, 0.85, -0.68 + (1.6 * k) / 6);
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
    expect(s.startGlazing(0)).toBeNull(); // one at a time
    expect(s.finishGlazing()).toBeNull(); // nothing poured yet
    glazeBoard(s, 'strawberry');
    expect(s.finishGlazing()?.id).toBe(id);
    expect(s.glazeWork).toBeNull();
    expect(s.shelf.map((d) => d.id)).toEqual([id]);
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

describe('GameSession: serving', () => {
  it('closing the box packs the best-matching shelf donuts and serves the customer straight away', () => {
    const s = makeSession({ ...fastSpawn, customersPerDay: [2] }, 1, 11);
    fryRack(s, 3);
    // Glaze one of everything day 1 might ask for.
    const recipes: [string, string?][] = [['cookies-and-cream'], ['strawberry', 'white-icing'], ['strawberry', 'white-icing']];
    for (const [base, drizzle] of recipes) {
      s.startGlazing(0);
      glazeBoard(s, base, drizzle);
      s.finishGlazing();
    }
    s.tick(1000);
    const { customer, ticket } = orderFront(s);
    let served = 0;
    s.events.on('served', () => served++);
    s.tick(4000);

    const e = s.serveActiveTicket();
    expect(served).toBe(1);
    expect(e.waitMs).toBe(4000);
    expect(s.customer(customer.id)!.state).toBe('served');
    expect(ticket.status).toBe('served');
    const packed = ticket.results.packed!;
    expect(packed.map((p) => p.flavorId)).toEqual(ticket.order.flavors);
    for (const p of packed) {
      // Each slot got a donut glazed for that flavour.
      expect(p.donut!.layers[0]!.glazeId).toBe(p.flavorId === 'cookies-and-cream' ? 'cookies-and-cream' : 'strawberry');
    }
    expect(ticket.results.missing).toBe(0);
    expect(ticket.results.glaze!.score).toBeGreaterThan(70);
    expect(ticket.results.fry!.score).toBeGreaterThan(80);
    expect(s.shelf).toHaveLength(3 - ticket.order.flavors.length);
  });

  it('an order with nothing on the shelf still serves, scoring zero for the empty slots', () => {
    const s = makeSession({ ...fastSpawn, customersPerDay: [2] }, 1, 11);
    s.tick(1000);
    const { ticket } = orderFront(s);
    s.serveActiveTicket();
    expect(ticket.results.missing).toBe(ticket.order.flavors.length);
    expect(ticket.results.glaze!.score).toBe(0);
    expect(ticket.results.fry!.score).toBe(0);
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
