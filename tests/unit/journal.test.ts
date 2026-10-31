import { describe, expect, it } from 'vitest';
import balanceJson from '../../src/data/balance.json';
import customersJson from '../../src/data/customers.json';
import journalJson from '../../src/data/journal.json';
import menuJson from '../../src/data/menu.json';
import type { Balance } from '../../src/systems/balance';
import { validateCustomers, type CustomersData } from '../../src/systems/customers';
import { GameSession, type DaySummary } from '../../src/systems/GameSession';
import { addPage, dayNote, DOODLE_PAGES, StickerTracker, type JournalData, type JournalPage } from '../../src/systems/journal';
import type { Menu } from '../../src/systems/menu';
import { createRng } from '../../src/systems/rng';
import { sanitizeSave } from '../../src/systems/SaveService';
import { weatherFor } from '../../src/systems/weather';
import { TextureKeys } from '../../src/assets/keys';

const balance = balanceJson as Balance;
const menu = menuJson as Menu;
const customers = customersJson as CustomersData;
const journal = journalJson as JournalData;

function day(n: number, opts: { weather?: string; regulars?: Record<string, number>; over?: Partial<Balance>; seed?: number } = {}): GameSession {
  return new GameSession({
    menu,
    customers,
    balance: { ...balance, maxActiveByDay: [99], ...opts.over },
    day: n,
    rng: createRng(opts.seed ?? 5),
    dayFlow: true,
    ...(opts.weather ? { weather: balance.weather.types.find((w) => w.id === opts.weather)! } : {}),
    ...(opts.regulars ? { regulars: opts.regulars } : {}),
  });
}

describe('weather', () => {
  it('day 1 is always sunny; a day always gets the same weather; every kind turns up', () => {
    expect(weatherFor(1, balance.weather).id).toBe('sunny');
    const seen = new Set<string>();
    for (let d = 2; d < 200; d++) {
      expect(weatherFor(d, balance.weather)).toBe(weatherFor(d, balance.weather));
      seen.add(weatherFor(d, balance.weather).id);
    }
    expect([...seen].sort()).toEqual(balance.weather.types.map((t) => t.id).sort());
  });

  it('rain brings extra delivery orders and fewer walk-ups; heat makes the oil heat faster', () => {
    const dry = day(3, { weather: 'sunny' });
    const wet = day(3, { weather: 'rainy' });
    const rainy = balance.weather.types.find((t) => t.id === 'rainy')!;
    expect(wet.pickups.length).toBe(dry.pickups.length + rainy.extraPickups);
    // Fewer walk-ups over the same stretch of time.
    const count = (s: GameSession) => {
      s.openShop();
      for (let t = 0; t < 180_000; t += 500) {
        s.tick(500);
        // Take orders as they come, so the line never fills up.
        const front = s.line[0];
        if (front?.state === 'inLine') {
          s.takeOrder(front.id);
          s.finishOrdering(front.id);
        }
      }
      return s.arrivals;
    };
    expect(count(day(2, { weather: 'rainy', seed: 9 }))).toBeLessThan(count(day(2, { weather: 'sunny', seed: 9 })));
    const cool = day(2, { weather: 'sunny' });
    const hot = day(2, { weather: 'hot' });
    for (const s of [cool, hot]) {
      s.fryer.temp = balance.fry.roomTempF;
      s.fryer.target = 375;
      for (let t = 0; t < 5000; t += 100) s.tick(100);
    }
    expect(hot.fryer.temp).toBeGreaterThan(cool.fryer.temp);
  });
});

describe('regulars', () => {
  it('the data checks out', () => {
    expect(validateCustomers(customers, menu, Object.values(TextureKeys))).toEqual([]);
  });

  /** Spawn until a regular comes (chance 1), take their order (by hand if needed), serve it. */
  function regularVisit(level: number) {
    const s = day(5, { regulars: { jade: level, thibodeaux: level, vo: level, remy: level }, over: { regulars: { ...balance.regulars, chance: 1 } } });
    const usual: { name: string }[] = [];
    s.events.on('usual', (e) => usual.push(e));
    s.openShop();
    for (let t = 0; t < 20_000 && s.arrivals === 0; t += 100) s.tick(100);
    s.tick(100); // the moment they reach the front
    // (Morning pickups come first in the customer list: the regular is the first walk-up.)
    const c = s.line[0] ?? s.waiting[0]!;
    return { s, c, usual };
  }

  it('a regular orders their usual, and a good order makes them like you more', () => {
    const { s, c, usual } = regularVisit(0);
    const reg = s.regularOf(c)!;
    expect(reg).toBeDefined();
    expect(usual).toHaveLength(0); // a first visit: they order at the window
    const t = s.takeOrder(c.id);
    expect(t.order.flavors).toEqual(reg.usual);
    s.finishOrdering(c.id);
    s.selectTicket(t.no); // (pickups are on the rail first)
    // Serve it well: pretend every station went perfectly by giving a great tier.
    const generous = s as unknown as { deps: { balance: Balance } };
    generous.deps.balance = { ...generous.deps.balance, scoring: { ...balance.scoring, tiers: { great: 0, good: 0, okay: 0 } } };
    const e = s.serveActiveTicket();
    expect(e.ticket.results.regular).toEqual({ name: reg.name, before: 0, after: 1 });
    expect(s.regularsLevels![reg.id]).toBe(1);
  });

  it('a regular who knows you well says "the usual!": their order goes straight on the rail', () => {
    const { s, c, usual } = regularVisit(balance.regulars.usualAt);
    expect(usual).toHaveLength(1);
    expect(c.state).toBe('waiting');
    expect(s.openTickets.some((t) => t.customerId === c.id)).toBe(true);
    expect(usual[0]!.name).toBe(s.regularOf(c)!.name);
  });

  it('a regular only comes once a day, and only when their usual is on the menu', () => {
    const s = day(1, { regulars: {}, over: { regulars: { ...balance.regulars, chance: 1 } } });
    s.openShop();
    for (let t = 0; t < 300_000; t += 500) {
      s.tick(500);
      const front = s.line[0];
      if (front?.state === 'inLine') {
        s.takeOrder(front.id);
        s.finishOrdering(front.id);
      }
    }
    const regs = s.waiting.map((c) => c.regularId).filter(Boolean);
    expect(new Set(regs).size).toBe(regs.length);
    // Day 1 menu: strawberry and cookies & cream, so only Jade and Mr. Thibodeaux.
    for (const id of regs) expect(['jade', 'thibodeaux']).toContain(id);
  });

  it('without regulars (tests, the tutorial) nobody named turns up', () => {
    const s = day(5);
    s.openShop();
    for (let t = 0; t < 60_000; t += 500) s.tick(500);
    expect(s.line.every((c) => !c.regularId)).toBe(true);
    expect(s.regularsLevels).toBeNull();
  });
});

describe("mochi's journal", () => {
  const ctx = { guidesOwned: () => 0, guideCount: 4 };

  it('every sticker in the data is one the tracker knows how to award', () => {
    const awardable = [
      'first-order', 'first-day', 'golden', 'great', 'perfect-order', 'gift', 'dough-perfect', 'regular', 'tidy', 'zero-waste',
      'busy', 'rainy', 'hot', 'pop-up', 'guides', 'week', 'full-house', 'speedy', 'comeback', 'friends',
    ];
    expect(journal.stickers.map((s) => s.id).sort()).toEqual(awardable.sort());
    expect(new Set(journal.stickers.map((s) => s.id)).size).toBe(journal.stickers.length);
  });

  it('a sticker is earned once ever, and told about once', () => {
    const owned = new Set<string>();
    const t = new StickerTracker(journal, owned, ctx);
    const got: string[] = [];
    t.events.on('earned', (s) => got.push(s.id));
    expect(t.award('golden')).toBe(true);
    expect(t.award('golden')).toBe(false);
    expect(t.award('nope')).toBe(false);
    expect(got).toEqual(['golden']);
    expect(t.today).toEqual(['golden']);
    // Tomorrow's tracker already knows.
    expect(new StickerTracker(journal, owned, ctx).award('golden')).toBe(false);
  });

  it('watching a day: frying, dough, six in the oil, and serving earn stickers', () => {
    const s = day(1);
    const t = new StickerTracker(journal, new Set(), { ...ctx, weather: 'sunny' });
    t.watch(s);
    const w = s.startDough()!;
    for (const [id, n] of Object.entries(balance.dough.recipe)) for (let i = 0; i < 3 * n; i++) w.scoop(id);
    w.stir(Math.PI * 2 * balance.dough.stirTurns);
    s.finishDough();
    expect(t.has('dough-perfect')).toBe(true);
    s.fryer.temp = 350;
    for (let i = 0; i < balance.fry.slots; i++) s.dropDonut();
    expect(t.has('full-house')).toBe(true);
    s.openShop();
    for (let k = 0; k < 200 && !s.line.length; k++) s.tick(100);
    const c = s.line[0]!;
    s.takeOrder(c.id);
    s.finishOrdering(c.id);
    s.serveActiveTicket();
    expect(t.has('first-order')).toBe(true);
    t.detach();
  });

  it('end of the day: the first day, a tidy close, no waste, a pop-up, the first week', () => {
    const t = new StickerTracker(journal, new Set(), ctx);
    const sum = { day: 7, served: 4, wasted: 0, tidy: true, event: 'a wedding' } as DaySummary;
    t.endOfDay(sum, true);
    expect(t.today.sort()).toEqual(['first-day', 'pop-up', 'tidy', 'week', 'zero-waste'].sort());
    const t2 = new StickerTracker(journal, new Set(), ctx);
    t2.endOfDay({ ...sum, day: 2, wasted: 3, tidy: false, event: undefined } as DaySummary, true);
    expect(t2.today).toEqual(['first-day']);
  });

  it('buying the last guide earns "by the book"', () => {
    let owned = 3;
    const t = new StickerTracker(journal, new Set(), { guidesOwned: () => owned, guideCount: 4 });
    t.checkGuides();
    expect(t.has('guides')).toBe(false);
    owned = 4;
    t.checkGuides();
    expect(t.has('guides')).toBe(true);
  });

  it("mochi's note fits the day", () => {
    const rng = createRng(1);
    const note = (avg: number, served: number) => dayNote(journal, { averageScore: avg, served, bestScore: 90 } as DaySummary, rng);
    expect(journal.notes.great.map((n) => n.replace('{served}', '3').replace('{best}', '90'))).toContain(note(90, 3));
    expect(journal.notes.quiet).toContain(note(0, 0));
    expect(note(30, 2)).not.toContain('{');
  });

  it('pages: one per day (rewriting replaces it), in order, and old ones drop their doodles', () => {
    const page = (d: number): JournalPage => ({ day: d, served: 1, best: 50, stickers: [], note: 'hi', doodle: 'data:x' });
    let pages: JournalPage[] = [];
    for (let d = DOODLE_PAGES + 5; d >= 1; d--) pages = addPage(pages, page(d));
    pages = addPage(pages, { ...page(3), note: 'again' });
    expect(pages.map((p) => p.day)).toEqual(Array.from({ length: DOODLE_PAGES + 5 }, (_, i) => i + 1));
    expect(pages[2]!.note).toBe('again');
    expect(pages.filter((p) => p.doodle).length).toBe(DOODLE_PAGES);
    expect(pages[pages.length - 1]!.doodle).toBeDefined();
  });

  it('the save keeps the journal and regulars, and cleans up junk', () => {
    const s = sanitizeSave({
      journal: { stickers: ['golden', 'golden', 3], pages: [{ day: 1, served: 2, best: 70, stickers: [], note: 'yay' }, { day: 'x' }], seen: 1 },
      regulars: { jade: 2, bad: -1, worse: 'x' },
    });
    expect(s.journal.stickers).toEqual(['golden']);
    expect(s.journal.pages).toHaveLength(1);
    expect(s.journal.seen).toBe(1);
    expect(s.regulars).toEqual({ jade: 2 });
    expect(sanitizeSave(null).journal).toEqual({ stickers: [], pages: [], seen: 0 });
  });
});
