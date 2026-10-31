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
import { boxStockId, clockText, doughCostPerDonut, fillStock, paymentFor, priceOn, startingStock } from '../../src/systems/supplies';

const balance = balanceJson as Balance;
const menu = menuJson as Menu;
const customers = customersJson as CustomersData;
const events = eventsJson.events as PopupEvent[];
const D = balance.dough;

function day(n = 2, opts: { event?: PopupEvent; seed?: number; over?: Partial<Balance>; stock?: Record<string, number> } = {}): GameSession {
  return new GameSession({
    menu,
    customers,
    balance: { ...balance, maxActiveByDay: [99], ...opts.over },
    day: n,
    rng: createRng(opts.seed ?? 3),
    dayFlow: true,
    events,
    ...(opts.event ? { event: opts.event } : {}),
    ...(opts.stock ? { stock: opts.stock } : {}),
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

  it('the scarcest ingredient sets the yield: just milk makes nothing, a double recipe makes double', () => {
    const milk = new DoughWork(D);
    for (let i = 0; i < 6; i++) milk.scoop('milk');
    expect(milk.yield).toBe(0);
    expect(milk.missing).toContain('rice-flour');
    const double = new DoughWork(D);
    for (const [id, n] of Object.entries(D.recipe)) for (let i = 0; i < n * 2; i++) double.scoop(id);
    expect(double.yield).toBe(D.batchSize * 2);
    expect(double.quality).toBe(1); // right proportions
    // Not enough egg for a double: the egg decides.
    const half = new DoughWork(D);
    for (const [id, n] of Object.entries(D.recipe)) for (let i = 0; i < n * 2; i++) if (id !== 'egg') half.scoop(id);
    half.scoop('egg');
    expect(half.yield).toBe(D.batchSize);
    expect(half.quality).toBeLessThan(1);
  });

  it('a batch that makes nothing can\'t go in the tub', () => {
    const s = day(1);
    const w = s.startDough()!;
    w.scoop('milk');
    w.stir(Math.PI * 2 * D.stirTurns);
    expect(w.stage).toBe('ready');
    expect(s.finishDough()).toBeNull();
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
    // Fill the tub up batch by batch; a batch that doesn't fit stays in the bowl.
    while (!s.tubFull) {
      perfectBatch(s);
      expect(s.finishDough()).not.toBeNull();
    }
    expect(s.dough).toBeLessThanOrEqual(D.tubCapacity);
    perfectBatch(s);
    expect(s.finishDough()).toBeNull();
    expect(s.trashDough()).toBe(true);
  });

  it('a lumpy batch fries a little worse', () => {
    const good = day(1, { seed: 1 });
    const lumpy = day(1, { seed: 1 });
    perfectBatch(good);
    good.finishDough();
    // The recipe, plus three extra scoops of milk.
    const w = lumpy.startDough()!;
    for (const [id, n] of Object.entries(D.recipe)) for (let i = 0; i < n; i++) w.scoop(id);
    for (let i = 0; i < 3; i++) w.scoop('milk');
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

  it('after the window closes and the last order is out, it is closing time; clean up for the tidy bonus, then close', () => {
    const s = day(1, { over: { day: { lengthSec: 10 } } });
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
    s.tick(6000); // time's up
    expect(s.timeUp).toBe(true);
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
    const s = day(1, { over: { day: { lengthSec: 10 } } });
    s.openShop();
    s.tick(5000);
    const c = s.line[0]!;
    s.takeOrder(c.id);
    s.finishOrdering(c.id);
    s.addMess('glaze', 10);
    s.tick(6000);
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
    // Every order counts as great and gets paid (this checks the tip multiplier, not payment).
    const generous = {
      scoring: { ...balance.scoring, tiers: { great: 0, good: 0, okay: 0 } },
      payment: { ...balance.payment, awfulBelow: -1 },
    };
    const popup = day(2, { event: ev, over: generous });
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

describe('the timed day', () => {
  it('walk-ups keep coming until time is up; then the line goes home and the window shuts', () => {
    const s = day(1, { over: { day: { lengthSec: 60 } } });
    expect(s.timeLeftMs).toBe(60_000);
    s.openShop();
    s.tick(5000);
    expect(s.timeLeftMs).toBe(55_000);
    expect(clockText(s.timeLeftMs)).toBe('0:55');
    const c = s.line[0]!;
    s.takeOrder(c.id);
    s.finishOrdering(c.id);
    for (let t = 0; t < 54_000; t += 1000) s.tick(1000);
    expect(s.timeUp).toBe(false);
    const inLine = s.line.length;
    let ups = 0;
    s.events.on('timeUp', () => ups++);
    s.tick(2000);
    expect(s.timeUp).toBe(true);
    expect(ups).toBe(1);
    expect(s.timeLeftMs).toBe(0);
    expect(s.line).toHaveLength(0);
    // Whoever was still in line went home; the one who ordered is still waiting.
    expect(s.summary().wentHome).toBe(inLine);
    expect(s.waiting).toHaveLength(1);
    expect(s.phase).toBe('open');
    // No one new comes.
    s.tick(60_000);
    expect(s.line).toHaveLength(0);
  });

  it("can't finish the last orders? send them home (unpaid), and it's closing time", () => {
    const s = day(1, { over: { day: { lengthSec: 10 } } });
    s.openShop();
    s.tick(5000);
    const c = s.line[0]!;
    s.takeOrder(c.id);
    s.finishOrdering(c.id);
    expect(s.sendHome()).toBe(0); // not before time's up
    s.tick(6000);
    expect(s.sendHome()).toBe(1);
    expect(s.phase).toBe('closing');
    expect(s.servedCount).toBe(0);
    expect(s.summary()).toMatchObject({ served: 0, sales: 0 });
  });

  it('days never run out: day 99 is a normal day', () => {
    const s = day(99);
    expect(s.openShop()).toBe(true);
    s.tick(5000);
    expect(s.line.length).toBeGreaterThan(0);
  });
});

describe('supplies', () => {
  const S = balance.supplies;

  it('a new game starts with the starting stock; a saved stock gets new items at 0', () => {
    const st = startingStock(S);
    expect(st['rice-flour']).toBe(S.start['rice-flour']);
    expect(Object.keys(st).sort()).toEqual(S.items.map((i) => i.id).sort());
    expect(fillStock({ milk: 3 }, S)).toMatchObject({ milk: 3, egg: 0 });
  });

  it('every scoop uses an ingredient; out of one, you can\'t scoop it', () => {
    const s = day(1, { stock: { ...startingStock(S), egg: 1 } });
    expect(s.tracksSupplies).toBe(true);
    expect(s.scoop('egg')).toBe(true);
    expect(s.stockOf('egg')).toBe(0);
    expect(s.doughBatch!.scoopsOf('egg')).toBe(1);
    expect(s.scoop('egg')).toBe(false);
    expect(s.doughBatch!.scoopsOf('egg')).toBe(1);
    expect(s.scoop('glitter')).toBe(false);
  });

  it('without a stock (tutorial, tests), supplies never run out', () => {
    const s = day(1);
    expect(s.tracksSupplies).toBe(false);
    expect(s.stockOf('egg')).toBe(Infinity);
    for (let i = 0; i < 50; i++) expect(s.scoop('egg')).toBe(true);
  });

  it('+ oil uses a jug (not when the vat is full, nor when you are out)', () => {
    const s = day(1, { stock: { ...startingStock(S), oil: 1 } });
    expect(s.addOil()).toBe('full');
    s.fryer.oil = 0.5;
    expect(s.addOil()).toBe('ok');
    expect(s.stockOf('oil')).toBe(0);
    s.fryer.oil = 0.5;
    expect(s.addOil()).toBe('none');
  });

  it('serving uses up the box; out of that box it goes in a napkin, for half the box score', () => {
    const run = (boxes: number) => {
      const s = day(1, { over: { day: { lengthSec: 10 } }, stock: { ...startingStock(S), [boxStockId('single')]: boxes, [boxStockId('trio')]: boxes, [boxStockId('flight')]: boxes, [boxStockId('domochi-box')]: boxes } });
      s.openShop();
      s.tick(5000);
      const c = s.line[0]!;
      const t = s.takeOrder(c.id);
      s.finishOrdering(c.id);
      const id = boxStockId(t.packBoxId ?? t.order.boxId);
      s.serveActiveTicket();
      return { s, t, id };
    };
    const ok = run(1);
    expect(ok.s.stockOf(ok.id)).toBe(0);
    expect(ok.t.results.napkin).toBeUndefined();
    const out = run(0);
    expect(out.t.results.napkin).toBe(true);
    expect(out.s.stockOf(out.id)).toBe(0);
  });

  it("when you're low, one of Ethan's friends may drop off a pack", () => {
    const sure = { ...S, friendChance: 1, friendCheckSec: 10, friendsPerDay: 1 };
    const s = day(1, { over: { supplies: sure }, stock: { ...startingStock(S), egg: 0 } });
    const drops: { itemId: string; qty: number; line: string; name: string }[] = [];
    s.events.on('friend', (e) => drops.push(e));
    s.tick(60_000); // not before opening
    expect(drops).toHaveLength(0);
    s.openShop();
    s.tick(10_500);
    expect(drops).toHaveLength(1);
    const egg = S.items.find((i) => i.id === 'egg')!;
    expect(drops[0]).toMatchObject({ itemId: 'egg', qty: egg.pack });
    expect(drops[0]!.line).not.toContain('{');
    expect(s.stockOf('egg')).toBe(egg.pack);
    s.tick(60_000);
    expect(drops).toHaveLength(1); // friendsPerDay
  });

  it("nobody's low, nobody drops anything off", () => {
    const sure = { ...S, friendChance: 1, friendCheckSec: 10 };
    const plenty = Object.fromEntries(S.items.map((i) => [i.id, i.pack * 5]));
    const s = day(1, { over: { supplies: sure }, stock: plenty });
    let n = 0;
    s.events.on('friend', () => n++);
    s.openShop();
    s.tick(30_000);
    expect(n).toBe(0);
  });

  it('store prices swing a bit day to day, the same each time you look', () => {
    const egg = S.items.find((i) => i.id === 'egg')!;
    const prices = new Set<number>();
    for (let d = 1; d <= 20; d++) {
      const p = priceOn(egg, d, S.priceSwing);
      expect(p).toBe(priceOn(egg, d, S.priceSwing));
      expect(p).toBeGreaterThanOrEqual(egg.price * (1 - S.priceSwing) - 0.05);
      expect(p).toBeLessThanOrEqual(egg.price * (1 + S.priceSwing) + 0.05);
      prices.add(p);
    }
    expect(prices.size).toBeGreaterThan(3);
  });
});

describe('payment and waste', () => {
  const P = balance.payment;

  it('good orders pay in full; okay a bit less; bad half and no tip; awful nothing, and they take from the tip jar', () => {
    expect(paymentFor(95, 'great', P)).toEqual({ share: P.full, tips: true, takesFromJar: 0 });
    expect(paymentFor(75, 'good', P)).toEqual({ share: P.full, tips: true, takesFromJar: 0 });
    expect(paymentFor(50, 'okay', P)).toEqual({ share: P.okay, tips: true, takesFromJar: 0 });
    expect(paymentFor(30, 'bad', P)).toEqual({ share: P.bad, tips: false, takesFromJar: 0 });
    expect(paymentFor(P.awfulBelow - 1, 'bad', P)).toEqual({ share: 0, tips: false, takesFromJar: P.awfulTipJar });
  });

  it('an awful order (an empty box) pays nothing and takes back from the tip jar, never more than is in it', () => {
    const s = day(1, { over: { day: { lengthSec: 100 }, maxActiveByDay: [99], spawn: { ...balance.spawn, intervalSec: { min: 1, max: 1 }, maxInLine: 9 } } });
    s.openShop();
    s.tick(5000);
    const c = s.line[0]!;
    s.takeOrder(c.id);
    s.finishOrdering(c.id);
    const e = s.serveActiveTicket();
    expect(e.score.total).toBeLessThan(P.awfulBelow);
    expect(e.sale).toBe(0);
    expect(e.ticket.results.price).toBeGreaterThan(0);
    // The jar was empty: nothing to take.
    expect(e.score.tip).toBeCloseTo(0);
  });

  it('the summary counts unsold donuts and dough as waste, and takes the supplies used off the profit', () => {
    const s = day(1, { stock: startingStock(balance.supplies) });
    for (const [id, n] of Object.entries(D.recipe)) for (let i = 0; i < n; i++) expect(s.scoop(id)).toBe(true);
    s.doughBatch!.stir(Math.PI * 2 * D.stirTurns);
    s.finishDough();
    s.fryer.temp = 350;
    s.dropDonut();
    const sum = s.summary();
    // 1 frying + the rest of the batch still in the tub.
    expect(sum.wasted).toBe(D.batchSize);
    expect(sum.wasteCost).toBeCloseTo(D.batchSize * doughCostPerDonut(balance.supplies, D), 2);
    expect(sum.suppliesCost).toBeCloseTo(sum.wasteCost, 2); // all of it went to waste
    expect(sum.profit).toBeCloseTo(-sum.suppliesCost, 2);
  });
});
