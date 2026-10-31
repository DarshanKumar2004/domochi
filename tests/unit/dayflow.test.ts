import { describe, expect, it } from 'vitest';
import balanceJson from '../../src/data/balance.json';
import customersJson from '../../src/data/customers.json';
import eventsJson from '../../src/data/events.json';
import menuJson from '../../src/data/menu.json';
import { doughVerdict, DoughWork } from '../../src/stations/dough';
import type { Balance } from '../../src/systems/balance';
import type { CustomersData } from '../../src/systems/customers';
import { GameSession, type PopupEvent } from '../../src/systems/GameSession';
import type { Menu } from '../../src/systems/menu';
import { createRng } from '../../src/systems/rng';
import { tipFor } from '../../src/systems/score';

const balance = balanceJson as Balance;
const menu = menuJson as Menu;
const customers = customersJson as CustomersData;
const events = eventsJson.events as PopupEvent[];
const D = balance.dough;

function day(n = 2, opts: { event?: PopupEvent; seed?: number; over?: Partial<Balance> } = {}): GameSession {
  return new GameSession({
    menu,
    customers,
    balance: { ...balance, maxActiveByDay: [99], ...opts.over },
    day: n,
    rng: createRng(opts.seed ?? 3),
    dayFlow: true,
    events,
    ...(opts.event ? { event: opts.event } : {}),
  });
}

/** Scoop the recipe exactly and stir it smooth. */
function perfectBatch(s: GameSession) {
  const w = s.startDough()!;
  for (const [id, n] of Object.entries(D.recipe)) for (let i = 0; i < n; i++) w.scoop(id);
  w.stir(Math.PI * 2 * D.stirTurns);
  return w;
}

describe('dough', () => {
  it('the recipe exactly, stirred smooth, is a perfect batch', () => {
    const w = new DoughWork(D);
    expect(w.stage).toBe('ingredients');
    w.stir(10); // nothing in the bowl yet: nothing to stir
    expect(w.turns).toBe(0);
    for (const [id, n] of Object.entries(D.recipe)) for (let i = 0; i < n; i++) expect(w.scoop(id)).toBe(true);
    expect(w.scoop('glitter')).toBe(false);
    expect(w.quality).toBe(1);
    w.stir(Math.PI * 2);
    expect(w.stage).toBe('stirring');
    w.stir(-Math.PI * 2 * D.stirTurns); // either direction counts
    expect(w.stage).toBe('ready');
    expect(doughVerdict(w.quality)).toBe('perfect dough!');
  });

  it('scoops off the recipe (extra or missing) cost quality, down to a floor', () => {
    const w = new DoughWork(D);
    w.scoop('rice-flour');
    expect(w.quality).toBeCloseTo(Math.max(D.qualityFloor, 1 - D.scoopPenalty * (Object.values(D.recipe).reduce((a, b) => a + b, 0) - 1)));
    for (let i = 0; i < 30; i++) w.scoop('sugar');
    expect(w.quality).toBe(D.qualityFloor);
  });
});

describe('a full day: prep, open, closing', () => {
  it('starts closed with no dough; walk-ups only come once you open', () => {
    const s = day(1);
    expect(s.phase).toBe('prep');
    expect(s.dough).toBe(0);
    s.tick(60_000);
    expect(s.line).toHaveLength(0);
    expect(s.dropDonut()).toBe(-1); // no dough
    expect(s.openShop()).toBe(true);
    expect(s.openShop()).toBe(false);
    s.tick(balance.spawn.firstDelaySec * 1000 + 100);
    expect(s.line).toHaveLength(1);
  });

  it('a batch fills the tub; each donut uses one; the tub has a limit', () => {
    const s = day(1);
    perfectBatch(s);
    expect(s.finishDough()).toEqual({ quality: 1, added: D.batchSize });
    expect(s.dough).toBe(D.batchSize);
    s.fryer.temp = 350;
    expect(s.dropDonut()).toBeGreaterThanOrEqual(0);
    expect(s.dough).toBe(D.batchSize - 1);
    expect(s.oilDirt).toBe(1);
    // A second batch fits (24), a third doesn't.
    perfectBatch(s);
    expect(s.finishDough()).not.toBeNull();
    perfectBatch(s);
    expect(s.tubFull).toBe(true);
    expect(s.finishDough()).toBeNull();
    expect(s.trashDough()).toBe(true);
  });

  it('a lumpy batch fries a little worse', () => {
    const good = day(1, { seed: 1 });
    const lumpy = day(1, { seed: 1 });
    perfectBatch(good);
    good.finishDough();
    const w = lumpy.startDough()!;
    w.scoop('rice-flour');
    w.stir(Math.PI * 2 * D.stirTurns);
    lumpy.finishDough();
    for (const s of [good, lumpy]) {
      s.fryer.temp = 350;
      s.dropDonut();
      for (let t = 0; t < balance.fry.secondsPerSide * 1000; t += 100) s.tick(100);
      s.fryer.flipAll();
      for (let t = 0; t < balance.fry.secondsPerSide * (1 - balance.fry.topFactorFloating) * 1000; t += 100) s.tick(100);
      s.pullAll();
    }
    expect(lumpy.rack[0]!.score).toBeLessThan(good.rack[0]!.score);
    expect(lumpy.rack[0]!.score).toBeGreaterThanOrEqual(Math.floor(good.rack[0]!.score * (1 - balance.fry.doughEffect)));
  });

  it('after the last order it is closing time; clean up for the tidy bonus, then close', () => {
    const s = day(1, { over: { customersPerDay: [1] } });
    s.openShop();
    s.tick(5000);
    const c = s.line[0]!;
    s.takeOrder(c.id);
    s.finishOrdering(c.id);
    s.addMess('glaze', 10);
    s.addMess('toppings', 1); // already under the "clean" line
    perfectBatch(s);
    s.finishDough();
    s.dropDonut(); // dirties the oil
    let complete = 0;
    s.events.on('dayComplete', () => complete++);
    s.serveActiveTicket();
    expect(s.phase).toBe('closing');
    expect(s.isDayComplete).toBe(false);
    expect(complete).toBe(0);
    expect(s.cleanup).toEqual({ glazeTray: false, toppingsTray: true, oil: false });
    expect(s.wipe('glaze', 3)).toBe(false);
    expect(s.wipe('glaze', 10)).toBe(true);
    expect(s.messOn('glaze')).toBe(0);
    s.filterOil();
    expect(s.cleanup).toEqual({ glazeTray: true, toppingsTray: true, oil: true });
    expect(s.closeUp()).toBe(true);
    expect(s.isDayComplete).toBe(true);
    expect(complete).toBe(1);
    expect(s.summary()).toMatchObject({ tidy: true, tidyBonus: balance.cleanup.tidyBonus });
  });

  it('closing without cleaning is allowed, just no bonus', () => {
    const s = day(1, { over: { customersPerDay: [1] } });
    s.openShop();
    s.tick(5000);
    const c = s.line[0]!;
    s.takeOrder(c.id);
    s.finishOrdering(c.id);
    s.addMess('glaze', 10);
    s.serveActiveTicket();
    s.closeUp();
    expect(s.summary()).toMatchObject({ tidy: false, tidyBonus: 0 });
  });
});

describe('morning pickups', () => {
  it('from day 2, pickup orders are on the rail before opening; they never stand in line', () => {
    expect(day(1).pickups).toHaveLength(0);
    const s = day(2);
    const n = balance.deliveries.byDay[1]!;
    expect(s.pickups).toHaveLength(n);
    expect(s.openTickets).toHaveLength(n);
    expect(s.openTickets.every((t) => t.delivery)).toBe(true);
    expect(s.line).toHaveLength(0);
    expect(s.waiting).toHaveLength(0);
    expect(s.customersToday).toBe(s.walkUpsToday + n);
    const t = s.openTickets[0]!;
    expect(t.order.flavors.length).toBeGreaterThanOrEqual(balance.deliveries.size.min);
    expect(customers.types.find((x) => x.id === s.customer(t.customerId)!.typeId)!.delivery).toBe(true);
    // A pickup doesn't use up a walk-up spot.
    expect(s.activeCustomers).toBe(0);
  });

  it('a served pickup counts in the summary', () => {
    const s = day(2);
    s.serveActiveTicket();
    expect(s.summary().pickups).toBe(1);
  });
});

describe('event invites and pop-up days', () => {
  it('a great order can bring an invite; accepting books tomorrow', () => {
    // Find a seed where the first (empty-box, 'bad') order doesn't invite, then force a great one by chance:
    // with inviteChance great = 1 the invite is certain.
    const sure = { ...balance.events, inviteChance: { great: 1, good: 1, okay: 1, bad: 1 } };
    const s = day(1, { over: { customersPerDay: [2], events: sure } });
    s.openShop();
    s.tick(5000);
    const c = s.line[0]!;
    s.takeOrder(c.id);
    s.finishOrdering(c.id);
    s.serveActiveTicket();
    expect(s.invite).toBeDefined();
    expect(events.map((e) => e.id)).toContain(s.invite!.id);
    s.answerInvite(true);
    expect(s.summary().nextEvent).toBe(s.invite!.name);
    // Only one invite a day.
    s.tick(20_000);
    const d = s.line[0]!;
    const first = s.invite!.id;
    s.takeOrder(d.id);
    s.finishOrdering(d.id);
    const e = s.serveActiveTicket();
    expect(e.ticket.results.invite).toBeUndefined();
    expect(s.invite!.id).toBe(first);
  });

  it('a pop-up day has more customers, arriving faster, tipping more, and no pickups', () => {
    const ev = events.find((e) => e.id === 'wedding')!;
    const normal = day(2);
    const popup = day(2, { event: ev });
    expect(popup.event?.name).toBe(ev.name);
    expect(popup.pickups).toHaveLength(0);
    expect(popup.walkUpsToday).toBe(Math.round(normal.walkUpsToday * ev.customersMultiplier));
    expect(popup.summary().event).toBe(ev.name);
    // The pop-up crowd tips tipMultiplier × the usual tip.
    popup.openShop();
    popup.tick(5000);
    const c = popup.line[0]!;
    const t = popup.takeOrder(c.id);
    popup.finishOrdering(c.id);
    const score = popup.serveActiveTicket().score;
    const usual = tipFor(score.total, t.order.flavors.length, balance.scoring) + score.giftTip;
    expect(score.tip).toBeCloseTo(Math.round(usual * ev.tipMultiplier * 100) / 100);
  });
});
