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
import { boxStockId, clockText, doughCostPerDonut, errandFor, fillStock, paymentFor, priceOn, startingStock, type Errand } from '../../src/systems/supplies';

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
    expect(s.cleanup).toEqual({ glazeTray: false, toppingsTray: true, oil: false, bowl: false });
    expect(s.wipe('glaze', 3)).toBe(false);
    expect(s.wipe('glaze', 10)).toBe(true);
    expect(s.messOn('glaze')).toBe(0);
    s.filterOil();
    s.washBowl(balance.cleanup.bowlWashTurns!);
    expect(s.cleanup).toEqual({ glazeTray: true, toppingsTray: true, oil: true, bowl: true });
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
    const sure = { ...balance.events, inviteChance: { great: 1, good: 1, okay: 1, bad: 1 }, fromDay: 1 };
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
    const sure = { ...S, friendChance: 1, friendCheckSec: 10, friendsPerDay: 1, friendsFromDay: 1, errand: undefined }; // the random drop-offs only (not a store run)
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

describe('closing early', () => {
  it('the window can only close early when you are out of baking materials (no skipping days)', () => {
    const plenty = day(1, { stock: startingStock(balance.supplies) });
    plenty.openShop();
    plenty.tick(5000);
    expect(plenty.outOfMaterials).toBe(false); // nothing in the tub, but a batch can still be made
    expect(plenty.closeEarly()).toBe(false);

    const s = day(1, { stock: { ...startingStock(balance.supplies), egg: 0 } });
    expect(s.closeEarly()).toBe(false); // not before opening
    s.openShop();
    s.tick(5000);
    expect(s.missingIngredients).toEqual(['egg']);
    expect(s.outOfMaterials).toBe(true);
    expect(s.closeEarly()).toBe(true);
    expect(s.timeUp).toBe(true);
    expect(s.line).toHaveLength(0);
    expect(s.closeEarly()).toBe(false);
  });

  it('dough in the tub means you can still bake: no closing early', () => {
    const s = day(1, { stock: startingStock(balance.supplies) });
    perfectBatch(s);
    s.finishDough();
    for (const id of Object.keys(balance.dough.recipe)) while (s.stockOf(id) > 0) s.useSupply(id);
    s.openShop();
    expect(s.missingIngredients.length).toBeGreaterThan(0);
    expect(s.outOfMaterials).toBe(false);
  });
});
describe('a calm start', () => {
  it('no friends drop by and nobody invites you before friendsFromDay / events.fromDay', () => {
    expect(balance.supplies.friendsFromDay).toBeGreaterThan(1);
    expect(balance.events.fromDay).toBeGreaterThan(1);
    const sure = { ...balance.supplies, friendChance: 1, friendCheckSec: 10, errand: undefined }; // the out-of-materials rescue comes any day
    const s = day(1, { over: { supplies: sure, events: { ...balance.events, inviteChance: { great: 1, good: 1, okay: 1, bad: 1 } } }, stock: { ...startingStock(balance.supplies), egg: 0 } });
    let friends = 0;
    s.events.on('friend', () => friends++);
    s.openShop();
    s.tick(5000);
    const c = s.line[0]!;
    s.takeOrder(c.id);
    s.finishOrdering(c.id);
    s.serveActiveTicket();
    s.tick(60_000);
    expect(friends).toBe(0);
    expect(s.invite).toBeUndefined();
  });
});

describe('saving a day in progress', () => {
  it('a snapshot picks the day back up: clock, customers, orders, money, supplies, dough (kitchen donuts count as thrown away)', () => {
    const stock = startingStock(balance.supplies);
    const s = day(2, { over: { day: { lengthSec: 120 } }, stock });
    perfectBatch(s);
    s.finishDough();
    s.openShop();
    s.tick(5000);
    const c = s.line[0]!;
    const t = s.takeOrder(c.id);
    s.finishOrdering(c.id);
    s.selectTicket(t.no);
    s.serveActiveTicket();
    s.tick(8000);
    s.fryer.temp = 350;
    s.dropDonut(); // in the oil when the page goes away
    const snap = JSON.parse(JSON.stringify(s.snapshot()));
    const before = s.summary();

    const r = day(2, { over: { day: { lengthSec: 120 } }, stock: startingStock(balance.supplies) });
    r.restore(snap);
    expect(r.phase).toBe('open');
    expect(r.timeLeftMs).toBe(s.timeLeftMs);
    expect(r.servedCount).toBe(1);
    expect(r.openTickets.map((x) => x.no)).toEqual(s.openTickets.map((x) => x.no));
    expect(r.line.map((x) => x.id)).toEqual(s.line.map((x) => x.id));
    expect(r.dough).toBe(s.dough);
    expect(r.stockOf('box-trio')).toBe(s.stockOf('box-trio'));
    const after = r.summary();
    expect(after.sales).toBe(before.sales);
    expect(after.tips).toBe(before.tips);
    expect(after.trashed).toBe(before.trashed + 1); // the donut in the oil
    // And the day carries on: time runs out as before.
    r.tick(130_000);
    expect(r.timeUp).toBe(true);
  });
});

describe('glazes and toppings are supplies', () => {
  it('a serving is used per use; none left, none used; each new flavour brings its own items, sold from its unlock day', () => {
    const s = day(1, { stock: { ...startingStock(balance.supplies), 'glaze-strawberry': 1 } });
    expect(s.useSupply('glaze-strawberry')).toBe(true);
    expect(s.useSupply('glaze-strawberry')).toBe(false);
    expect(s.stockOf('glaze-strawberry')).toBe(0);
    // Every glaze and topping a flavour needs is on sale from (at latest) that flavour's day.
    for (const f of menu.flavors) {
      const needs = [...(f.glaze ? [f.glaze] : []), ...(f.drizzle ? [f.drizzle] : [])].map((g) => `glaze-${g}`).concat((f.toppings ?? []).map((t) => `topping-${t}`));
      for (const id of needs) {
        const it = balance.supplies.items.find((i) => i.id === id);
        expect(it, id).toBeDefined();
        expect(it!.unlockDay ?? 1).toBeLessThanOrEqual(f.unlockDay);
      }
    }
    // Day 1's flavours start stocked; later ones start at 0.
    const st = startingStock(balance.supplies);
    expect(st['topping-powdered-sugar']).toBeGreaterThan(0); // the beignet is the starter
    expect(st['glaze-strawberry']).toBe(0);
    expect(st['glaze-cookie-butter']).toBe(0);
  });
});

describe('special of the day, streaks, patience', () => {
  it("the special is on today's menu, the same each time you play that day, and sells for more", () => {
    expect(day(balance.special.fromDay! - 1).special).toBeUndefined(); // not before it's unlocked
    const a = day(12);
    const b = day(12, { seed: 99 });
    expect(a.special).toBeDefined();
    expect(a.special).toBe(b.special);
    expect(menu.flavors.find((f) => f.id === a.special)!.unlockDay).toBeLessThanOrEqual(12);
    // Over many days, more than one flavour gets a turn.
    expect(new Set(Array.from({ length: 30 }, (_, i) => day(i + 12).special)).size).toBeGreaterThan(1);
  });

  it('good orders in a row build a streak that tips more; a bad one ends it', () => {
    const generous = { scoring: { ...balance.scoring, tiers: { great: 0, good: 0, okay: 0 } }, payment: { ...balance.payment, awfulBelow: -1 } };
    const s = day(1, { over: { ...generous, day: { lengthSec: 600 }, spawn: { ...balance.spawn, intervalSec: { min: 1, max: 1 } } } });
    const streaks: number[] = [];
    s.events.on('streak', (e) => streaks.push(e.count));
    s.openShop();
    for (let n = 0; n < 3; n++) {
      for (let k = 0; k < 100 && !s.line.some((c) => c.state === 'inLine'); k++) s.tick(500);
      const c = s.line.find((x) => x.state === 'inLine')!;
      const t = s.takeOrder(c.id);
      s.finishOrdering(c.id);
      s.selectTicket(t.no);
      s.serveActiveTicket();
    }
    expect(s.streakNow).toBe(3);
    expect(streaks).toEqual([2, 3]);
    expect(s.summary().bestStreak).toBe(3);
  });

  it("a waiting customer's hearts empty as they wait", () => {
    const s = day(1, { over: { day: { lengthSec: 9999 } } });
    s.openShop();
    s.tick(5000);
    const c = s.line[0]!;
    s.takeOrder(c.id);
    s.finishOrdering(c.id);
    expect(s.patienceHearts(c)).toBe(3);
    for (let t = 0; t < 3600; t++) s.tick(1000);
    expect(s.patienceHearts(c)).toBe(0);
  });

  it('day stars: none for an empty day, up to three for a great one', async () => {
    const { dayStars, starText } = await import('../../src/systems/journal');
    expect(dayStars({ served: 0, averageScore: 0 })).toBe(0);
    expect(dayStars({ served: 2, averageScore: 40 })).toBe(1);
    expect(dayStars({ served: 2, averageScore: 70 })).toBe(2);
    expect(dayStars({ served: 4, averageScore: 95 })).toBe(2);
    expect(dayStars({ served: 6, averageScore: 90 })).toBe(3);
    expect(starText(2)).toBe('★★☆');
  });
});

describe('daily goals', () => {
  it('from goals.fromDay, each day has a goal (the same for that day) whose target grows', () => {
    expect(day(balance.goals.fromDay - 1).goal).toBeUndefined();
    const g = day(5).goal!;
    expect(g).toBeDefined();
    expect(day(5, { seed: 42 }).goal).toEqual(g);
    expect(g.text).not.toContain('{');
    const ids = new Set(Array.from({ length: 40 }, (_, i) => day(i + balance.goals.fromDay).goal!.id));
    expect(ids.size).toBeGreaterThan(2);
  });

  it('meeting it says so once and pays the reward with the day', () => {
    // Find a day whose goal is to serve orders.
    let d = balance.goals.fromDay;
    while (day(d).goal!.id !== 'serve') d++;
    const generous = { scoring: { ...balance.scoring, tiers: { great: 0, good: 0, okay: 0 } }, payment: { ...balance.payment, awfulBelow: -1 } };
    const s = day(d, { over: { ...generous, day: { lengthSec: 900 }, spawn: { ...balance.spawn, intervalSec: { min: 1, max: 1 } } } });
    const target = s.goal!.target;
    const hits: string[] = [];
    s.events.on('goal', (e) => hits.push(e.text));
    s.openShop();
    for (let n = 0; n < target + 1; n++) {
      for (let k = 0; k < 200 && !s.line.some((c) => c.state === 'inLine'); k++) s.tick(500);
      const c = s.line.find((x) => x.state === 'inLine')!;
      const t = s.takeOrder(c.id);
      s.finishOrdering(c.id);
      s.selectTicket(t.no);
      s.serveActiveTicket();
      if (n < target - 1) expect(s.goalProgress!.done).toBe(false);
    }
    expect(hits).toHaveLength(1);
    expect(s.goalProgress!.done).toBe(true);
    expect(s.summary().goalBonus).toBe(balance.goals.reward);
  });
});

describe("mochi's shopping plan", () => {
  it('musts first, within the cash; what can not be afforded is flagged', async () => {
    const { shopNeeds, shoppingPlan } = await import('../../src/systems/supplies');
    const S = balance.supplies;
    const needs = shopNeeds(S, D.recipe, new Set(['glaze-strawberry']), 1);
    const empty = Object.fromEntries(S.items.map((i) => [i.id, 0]));
    const price = (id: string) => S.items.find((i) => i.id === id)!.price;
    const rich = shoppingPlan(S, needs, empty, 1000, price);
    expect(rich.every((p) => p.affordable)).toBe(true);
    expect(rich[0]!.priority).toBe(1);
    expect(rich.some((p) => p.id === 'glaze-strawberry' && p.priority === 2)).toBe(true);
    // Broke: nothing affordable, the musts still listed.
    const broke = shoppingPlan(S, needs, empty, 0, price);
    expect(broke.length).toBeGreaterThan(0);
    expect(broke.every((p) => !p.affordable && p.priority === 1)).toBe(true);
    // Well stocked: nothing to buy.
    const full = Object.fromEntries(S.items.map((i) => [i.id, 999]));
    expect(shoppingPlan(S, needs, full, 1000, price)).toEqual([]);
  });
});

describe("a friend's store run when you're out of baking materials", () => {
  const sb = balance.supplies;
  const eb = sb.errand!;
  const price = (id: string) => sb.items.find((i) => i.id === id)!.price;
  const noFlour = () => ({ ...startingStock(sb), 'rice-flour': 0 });
  /** The game ticks every frame: step the clock in small bits. */
  const run = (s: GameSession, ms: number) => {
    for (let t = 0; t < ms; t += 250) s.tick(250);
  };
  const withBank = (bank: number) =>
    new GameSession({ menu, customers, balance, day: 4, rng: createRng(3), dayFlow: true, events, stock: noFlour(), bank: () => bank });

  it('with the money: supplies for a few batches, plus a fee; broke: one batch, free', () => {
    const paid = errandFor(sb, eb, D.recipe, noFlour(), 100, price)!;
    expect(paid.free).toBe(false);
    const flour = sb.items.find((i) => i.id === 'rice-flour')!;
    expect(paid.items).toEqual([{ id: 'rice-flour', name: flour.name, packs: Math.ceil((D.recipe['rice-flour']! * eb.batches) / flour.pack) }]);
    expect(paid.cost).toBeCloseTo(paid.items[0]!.packs * flour.price);
    expect(paid.fee).toBeCloseTo(Math.max(eb.feeMin, paid.cost * eb.feeRate));
    const rescue = errandFor(sb, eb, D.recipe, noFlour(), 0, price)!;
    expect(rescue).toMatchObject({ free: true, cost: 0, fee: 0 });
    expect(rescue.items[0]!.packs * flour.pack).toBeGreaterThanOrEqual(D.recipe['rice-flour']!);
    // Nothing missing, no errand.
    expect(errandFor(sb, eb, D.recipe, startingStock(sb), 100, price)).toBeNull();
  });

  it('out of flour in the morning: a friend just brings it (no saying no), and it costs the supplies plus the fee (once a day)', () => {
    const s = withBank(50);
    const runs: Errand[] = [];
    const lines: string[] = [];
    s.events.on('errand', (e) => (runs.push(e.errand), lines.push(e.line)));
    expect(s.outOfMaterials).toBe(true);
    run(s, (eb.delaySec - 1) * 1000);
    expect(runs).toHaveLength(0); // not straight away
    run(s, 2000);
    expect(runs).toHaveLength(1);
    const e = runs[0]!;
    expect(lines[0]).toContain('rice flour');
    expect(s.errandOffer).toBeNull(); // nothing to answer: it's done
    expect(s.outOfMaterials).toBe(false);
    expect(s.stockOf('rice-flour')).toBeGreaterThanOrEqual(D.recipe['rice-flour']! * eb.batches);
    expect(s.cash).toBeCloseTo(50 - e.cost - e.fee);
    const sum = s.summary();
    expect(sum.errandSpent).toBeCloseTo(e.cost + e.fee);
    expect(sum.profit).toBeCloseTo(-e.fee); // the supplies count once they're used
    // Only one run a day.
    s.restore({ ...s.snapshot(), supplies: { ...s.snapshot().supplies!, 'rice-flour': 0 } });
    run(s, (eb.delaySec + 1) * 1000);
    expect(s.errandOffer).toBeNull();
  });

  it('broke, a friend just brings a batch, free', () => {
    const broke = withBank(0);
    const visits: string[] = [];
    broke.events.on('friend', (f) => visits.push(f.line));
    run(broke, (eb.delaySec + 1) * 1000);
    expect(broke.errandOffer).toBeNull();
    expect(visits).toHaveLength(1);
    expect(broke.outOfMaterials).toBe(false);
    expect(broke.summary().errandSpent).toBe(0);
  });
});

describe('trays left dirty overnight grow mold', () => {
  const S = balance.supplies;
  const start = (mess?: { glaze: number; toppings: number; mold: { glaze: number; toppings: number } }) =>
    new GameSession({ menu, customers, balance, day: 5, rng: createRng(3), dayFlow: true, events, stock: startingStock(S), ...(mess ? { mess } : {}) });

  it("a tray that wasn't cleaned stays dirty tomorrow, and grows mold; a clean one doesn't", () => {
    const s = start();
    s.addMess('glaze', 10);
    const tomorrow = s.traysForTomorrow();
    expect(tomorrow.glaze).toBe(10);
    expect(tomorrow.mold.glaze).toBe(1);
    expect(tomorrow.toppings).toBe(0);
    expect(tomorrow.mold.toppings).toBe(0);
    const next = start(tomorrow);
    expect(next.messOn('glaze')).toBe(10);
    expect(next.moldOn('glaze')).toBe(1);
    // Another day without cleaning: worse.
    expect(next.traysForTomorrow().mold.glaze).toBe(2);
    // Scrubbing it clean clears the mold.
    next.wipe('glaze', 100);
    expect(next.moldOn('glaze')).toBe(0);
    expect(next.traysForTomorrow()).toEqual({ glaze: 0, toppings: 0, bowl: false, mold: { glaze: 0, toppings: 0, bowl: 0 } });
  });

});

describe('the dough bowl needs washing', () => {
  const start = (mess?: { glaze: number; toppings: number; bowl?: boolean; mold: { glaze: number; toppings: number; bowl?: number } }) =>
    new GameSession({ menu, customers, balance, day: 5, rng: createRng(3), dayFlow: true, events, stock: startingStock(balance.supplies), ...(mess ? { mess } : {}) });

  it('a batch dirties it; scrubbing round the empty bowl washes it; a tidy close needs it clean', () => {
    const s = start();
    expect(s.cleanup.bowl).toBe(true);
    perfectBatch(s);
    s.finishDough();
    expect(s.bowlNeedsWash).toBe(true);
    expect(s.cleanup.bowl).toBe(false);
    expect(s.washBowl(1)).toBe(false);
    expect(s.washBowl(balance.cleanup.bowlWashTurns!)).toBe(true);
    expect(s.cleanup.bowl).toBe(true);
  });

  it('left dirty overnight it grows mold: no mixing until it is washed', () => {
    const s = start();
    perfectBatch(s);
    s.finishDough();
    const tomorrow = s.traysForTomorrow();
    expect(tomorrow.bowl).toBe(true);
    expect(tomorrow.mold.bowl).toBe(1);
    const next = start(tomorrow);
    expect(next.bowlMoldy).toBe(true);
    expect(next.scoop('rice-flour')).toBe(false);
    next.washBowl(99);
    expect(next.bowlMoldy).toBe(false);
    expect(next.scoop('rice-flour')).toBe(true);
  });
});

describe("the real shop's featured flavour", () => {
  it("becomes the special of the day when you have it (and is ignored when you don't)", () => {
    const day12 = (featured?: string) =>
      new GameSession({ menu, customers, balance, day: 12, rng: createRng(3), dayFlow: true, events, ...(featured ? { featured } : {}) });
    expect(day12('strawberry').special).toBe('strawberry');
    expect(day12('cookie-butter').special).toBe(day12().special); // not unlocked on day 12
  });
});
