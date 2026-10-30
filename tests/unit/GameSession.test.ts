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
  return new GameSession({ menu, customers, balance: { ...baseBalance, ...over }, day, rng: createRng(seed) });
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

describe('GameSession: boxing and serving', () => {
  function twoWaiting() {
    const s = makeSession({ ...fastSpawn, customersPerDay: [2] }, 1, 5);
    s.tick(1000);
    s.tick(2000);
    const a = orderFront(s);
    const b = orderFront(s);
    return { s, a, b };
  }

  it('boxing picks up the active ticket and moves selection to the next open one', () => {
    const { s } = twoWaiting();
    const boxed = s.boxActiveTicket();
    expect(boxed.no).toBe(1);
    expect(boxed.status).toBe('boxed');
    expect(s.heldTicket?.no).toBe(1);
    expect(s.activeTicket?.no).toBe(2);
    expect(() => s.boxActiveTicket()).toThrow(); // hands are full
    expect(s.selectTicket(1)).toBe(false); // can't select a boxed ticket
  });

  it('handing the box to the wrong customer is refused with their line', () => {
    const { s, b } = twoWaiting();
    s.boxActiveTicket(); // ticket 1
    const r = s.handTo(b.customer.id);
    expect(r.ok).toBe(false);
    if (!r.ok && r.reason === 'notMine') expect(r.line).toContain('#2');
    else throw new Error('expected notMine');
    expect(s.heldTicket?.no).toBe(1);
  });

  it('handing over without a box is refused', () => {
    const { s, a } = twoWaiting();
    expect(s.handTo(a.customer.id)).toEqual({ ok: false, reason: 'noBox' });
  });

  it('serving the right customer reports wait time and completes the day at the end', () => {
    const { s, a, b } = twoWaiting();
    let served = 0;
    let dayDone = 0;
    s.events.on('served', () => served++);
    s.events.on('dayComplete', () => dayDone++);

    s.tick(5000);
    s.boxActiveTicket();
    const r1 = s.handTo(a.customer.id);
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.waitMs).toBe(s.timeMs - a.ticket.takenAtMs);
    expect(s.customer(a.customer.id)!.state).toBe('served');
    expect(s.heldTicket).toBeUndefined();
    expect(s.isDayComplete).toBe(false);

    s.boxActiveTicket();
    expect(s.handTo(b.customer.id).ok).toBe(true);
    expect(served).toBe(2);
    expect(dayDone).toBe(1);
    expect(s.isDayComplete).toBe(true);
    expect(s.openTickets).toHaveLength(0);
    expect(s.activeTicket).toBeUndefined();
  });
});

describe('GameSession: frying', () => {
  function oneWaiting() {
    const s = makeSession({ ...fastSpawn, customersPerDay: [3] }, 1, 11);
    s.tick(1000);
    const a = orderFront(s);
    return { s, a };
  }

  it('the fryer heats up on the session clock', () => {
    const { s } = oneWaiting();
    const before = s.fryer.temp;
    s.tick(2000);
    expect(s.fryer.temp).toBeGreaterThan(before);
  });

  it('frying the active ticket stores the result on that ticket', () => {
    const { s, a } = oneWaiting();
    expect(s.canStartFrying).toBe(true);
    s.startFrying();
    expect(s.fryingTicket?.no).toBe(a.ticket.no);
    expect(s.fryer.batch?.count).toBe(a.ticket.order.flavors.length);
    expect(s.canStartFrying).toBe(false); // fryer busy
    s.tick(4000);
    const r = s.pullFry();
    expect(s.ticket(a.ticket.no)!.results.fry).toBe(r);
    expect(s.fryingTicket).toBeUndefined();
    expect(s.nextDrop.ticketNo).toBeNull(); // already fried: Drop would now be a prep batch
  });

  it('a batch keeps belonging to its ticket even if you select another', () => {
    const s = makeSession({ ...fastSpawn, customersPerDay: [3] }, 1, 11);
    s.tick(1000);
    s.tick(2000);
    const a = orderFront(s);
    const b = orderFront(s);
    s.startFrying(); // ticket a is active
    s.selectTicket(b.ticket.no);
    s.tick(3000);
    s.pullFry();
    expect(s.ticket(a.ticket.no)!.results.fry).toBeDefined();
    expect(s.ticket(b.ticket.no)!.results.fry).toBeUndefined();
  });

  it('with no order to fry, Drop fries a prep batch that goes to the rack', () => {
    const s = makeSession(fastSpawn);
    expect(s.nextDrop).toEqual({ ticketNo: null, count: baseBalance.fry.prepBatchSize });
    s.startFrying();
    expect(s.fryingTicket).toBeUndefined();
    s.tick(5000);
    const r = s.pullFry();
    expect(r.ticketNo).toBeNull();
    expect(s.rack).toHaveLength(baseBalance.fry.prepBatchSize);
    for (const d of s.rack) expect(d.score).toBeGreaterThanOrEqual(0);
  });

  it('a ticket can take its donuts from the rack, oldest first', () => {
    const s = makeSession({ ...fastSpawn, customersPerDay: [3] }, 1, 11);
    s.startFrying(); // prep batch before anyone has ordered
    s.tick(6000);
    s.pullFry();
    s.startFrying(); // and a second one
    s.tick(6000);
    s.pullFry();
    const racked = s.rack.length;
    const { ticket } = orderFront(s);
    const n = ticket.order.flavors.length;
    const oldest = s.rack.slice(0, n).map((d) => d.score);

    expect(s.canUseRack).toBe(true);
    const r = s.useRack();
    expect(s.ticket(ticket.no)!.results.fry).toBe(r);
    expect(r.score).toBe(Math.round(oldest.reduce((a, b) => a + b, 0) / n));
    expect(s.rack).toHaveLength(racked - n);
    expect(s.canUseRack).toBe(false); // already fried
  });

  it('cannot use the rack when it has too few donuts', () => {
    const s = makeSession({ ...fastSpawn, customersPerDay: [3] }, 1, 11);
    s.tick(1000);
    orderFront(s);
    expect(s.rack).toHaveLength(0);
    expect(s.canUseRack).toBe(false);
    expect(() => s.useRack()).toThrow();
  });

  it('the rack never holds more than its capacity', () => {
    const s = makeSession(fastSpawn);
    for (let i = 0; i < 10; i++) {
      s.startFrying();
      s.tick(3000);
      s.pullFry();
      s.fryer.addOil();
    }
    expect(s.rack.length).toBe(baseBalance.fry.rackCapacity);
  });
});
