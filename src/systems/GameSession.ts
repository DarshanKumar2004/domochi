// One day at the trailer: customers arriving, orders, tickets and serving.
// Pure logic driven by tick(dtMs); scenes render from it and call its actions.
//
// The kitchen is a production line: fried donuts go to the rack, rack donuts
// are glazed one at a time and go to the shelf, shelf donuts can go to the
// toppings board and back, and the Box station packs shelf donuts into the
// selected order's box. Closing the lid hands it straight to that customer.
import { identifyFlavor, matchDonuts, scoreBox, type BoxResult } from '../stations/box';
import { DoughWork } from '../stations/dough';
import { Fryer, fryResultFromDonuts, type FriedDonut, type FryResult } from '../stations/fry';
import { GlazeWork, glazeScoreFor, ringMask, type MaskTemplate } from '../stations/glaze';
import { ToppingWork, toppingScoreFor, type FinishedDonut } from '../stations/toppings';
import { forDay, type Balance } from './balance';
import { pickLine, type CustomerType, type CustomersData, type RegularDef, type ThanksTier } from './customers';
import { Emitter } from './events';
import type { Menu } from './menu';
import { flavorsForDay } from './menu';
import { boxFor, describeOrder, generateOrder, orderPrice, orderSizeRange, type Order } from './orders';
import { scoreOrder, type OrderScore } from './score';
import { boxStockId, doughCostPerDonut, paymentFor, unitCost, type Stock } from './supplies';
import type { WeatherType } from './weather';
import type { Rng } from './rng';

export type CustomerState = 'inLine' | 'ordering' | 'waiting' | 'served';

export interface Customer {
  id: number;
  typeId: string;
  state: CustomerState;
  arrivedAtMs: number;
  /** Set once their order is taken. */
  ticketNo?: number;
  /** A morning pickup (a courier collects it); never stands in line. */
  delivery?: boolean;
  /** Left without being served (the window closed, or sent home). */
  wentHome?: boolean;
  /** A regular (customers.json regulars). */
  regularId?: string;
}

/**
 * The shape of a day (with dayFlow): morning prep (make dough, work on
 * pickups) with the window closed; open (walk-ups come); closing (clean up)
 * once everyone's served; closed (the day summary).
 */
export type DayPhase = 'prep' | 'open' | 'closing' | 'closed';

/** A pop-up booth day (events.json). */
export interface PopupEvent {
  id: string;
  name: string;
  invite: string;
  customersMultiplier: number;
  spawnFactor: number;
  tipMultiplier: number;
}

export type TicketStatus = 'open' | 'served';

/** One ordered donut in a served box: what was asked for and the donut matched to it. */
export interface PackedDonut {
  flavorId: string;
  donut?: FinishedDonut;
  /** 0–1 glaze match for this flavour (0 if nothing was there). */
  glazeScore: number;
  /** 0–1 toppings match for this flavour (0 if nothing was there). */
  toppingScore: number;
}

export interface Ticket {
  no: number;
  customerId: number;
  order: Order;
  /** What the customer said when ordering. */
  line: string;
  status: TicketStatus;
  takenAtMs: number;
  servedAtMs?: number;
  /** The box picked at the Box station (else the one that fits the order). */
  packBoxId?: string;
  /** A morning pickup order. */
  delivery?: boolean;
  /** Filled in when the box is closed and served. */
  results: {
    fry?: FryResult;
    glaze?: { score: number };
    toppings?: { score: number };
    box?: BoxResult;
    packed?: PackedDonut[];
    /** Ordered donuts with nothing in the box to match them. */
    missing?: number;
    /** The weighted order score, the customer's reaction tier and their tip. */
    score?: OrderScore;
    /** What the order sold for (dollars): the price, less for a poor order, nothing for an awful one. */
    sale?: number;
    /** The menu price of the order. */
    price?: number;
    /** Out of that box: it went out in a napkin (box score halved). */
    napkin?: boolean;
    /** The customer invited domochi to this event (an events.json id). */
    invite?: string;
    /** A regular's friendship before and after this order. */
    regular?: { name: string; before: number; after: number };
  };
}

export interface ServedEvent {
  customer: Customer;
  ticket: Ticket;
  waitMs: number;
  score: OrderScore;
  sale: number;
}

/** How the day went, for the end-of-day summary. */
export interface DaySummary {
  day: number;
  served: number;
  /** Average order score (0–100), 0 if nobody was served. */
  averageScore: number;
  bestScore: number;
  sales: number;
  tips: number;
  /** Donuts thrown away (trashed or burnt). */
  trashed: number;
  /** Donuts' worth wasted: thrown away, plus unsold at closing (made, or dough left in the tub). */
  wasted: number;
  /** What the wasted donuts cost to make. */
  wasteCost: number;
  /** What the supplies used today cost (dough ingredients, boxes, oil), the waste included. */
  suppliesCost: number;
  /** Sales + tips + clean-up bonus − supplies used. */
  profit: number;
  /** Walk-ups who went home without being served. */
  wentHome: number;
  /** Orders by reaction tier. */
  tiers: Record<'great' | 'good' | 'okay' | 'bad', number>;
  /** Extra donuts given away as gifts. */
  gifts: number;
  /** Morning pickups done. */
  pickups: number;
  /** Today's pop-up event, if it was one. */
  event?: string;
  /** Tomorrow's pop-up (an invite you accepted today). */
  nextEvent?: string;
  /** Cleaned up before closing (null if the day has no closing). */
  tidy: boolean | null;
  tidyBonus: number;
}

/**
 * A day in progress, saved so a reload (or the phone dropping the page) picks
 * up where you were: the clock, customers and orders, money earned, supplies
 * and the dough tub. Donuts mid-way through the kitchen (in the oil, on the
 * rack, trays, shelf or in the box) aren't kept: they count as thrown away.
 */
export interface DaySnapshot {
  v: 1;
  now: number;
  phase: DayPhase;
  dayEndsAtMs: number | null;
  windowClosed: boolean;
  nextSpawnAtMs: number;
  spawned: number;
  nextCustomerId: number;
  nextTicketNo: number;
  customers: Customer[];
  tickets: Ticket[];
  activeNo: number | null;
  trashed: number;
  doughLeft: number;
  doughQ: number;
  trayMess: { glaze: number; toppings: number };
  dirt: number;
  inviteId: string | null;
  inviteAccepted: boolean;
  supplies: Stock | null;
  used: Stock;
  friendsToday: number;
  nextFriendCheckMs: number | null;
  friendship: Record<string, number> | null;
  regularsToday: string[];
  fryer: { oil: number; temp: number; target: number };
}

export interface SessionEvents extends Record<string, unknown> {
  /** Anything visible changed (customers, tickets, selection, rack, shelf). */
  changed: undefined;
  served: ServedEvent;
  /** Donuts that burnt and were thrown out automatically. */
  burnt: { slots: number[] };
  dayComplete: undefined;
  /** The day moved on (prep → open → closing → closed). */
  phase: DayPhase;
  /** The window closed for the day (time's up): the last orders are still to finish. */
  timeUp: undefined;
  /** One of Ethan's friends dropped off a pack of something you were low on. */
  friend: { name: string; line: string; itemId: string; qty: number };
  /** A donut came out of the oil onto the rack (its fry score). */
  pulled: { score: number };
  /** A donut went into the oil: how many are frying now, of how many slots. */
  dropped: { frying: number; slots: number };
  /** A batch of dough went in the tub. */
  doughMade: { quality: number };
  /** A regular who knows you ordered "the usual": straight onto the rail. */
  usual: { customerId: number; name: string; line: string };
}

export interface SessionDeps {
  menu: Menu;
  customers: CustomersData;
  balance: Balance;
  day: number;
  rng: Rng;
  /**
   * A scripted day (the tutorial): exactly these orders, one customer each,
   * arriving quickly. No day summary at the end.
   */
  script?: { orders: Order[] };
  /**
   * The full day: morning prep with the window closed, dough to make, morning
   * pickups, and clean-up at closing. Without it (tests, the tutorial) the
   * window is open from the start, dough never runs out and the day ends when
   * everyone's served.
   */
  dayFlow?: boolean;
  /** Today is a pop-up booth day. */
  event?: PopupEvent;
  /** Frying needs dough even without the full day (the tutorial teaches the Dough station). */
  trackDough?: boolean;
  /** Events a happy customer might invite you to. */
  events?: PopupEvent[];
  /**
   * Supplies on hand (dough ingredients, boxes, oil): used up as you go. The
   * session keeps its own copy (see `stock`). Without it, supplies never run out.
   */
  stock?: Stock;
  /** Today's weather (sunny if not given). */
  weather?: WeatherType;
  /** How well each regular knows you (id → level). Without it, no regulars come. */
  regulars?: Record<string, number>;
}

export class GameSession {
  readonly events = new Emitter<SessionEvents>();
  readonly day: number;
  /** Everyone to serve today: walk-ups plus morning pickups. */
  readonly customersToday: number;
  /** Walk-up customers today. */
  readonly walkUpsToday: number;
  /** A scripted tutorial day (see SessionDeps.script). */
  readonly isTutorial: boolean;
  /** The fryer keeps running (heating, cooking) whichever station you're at. */
  readonly fryer: Fryer;

  private now = 0;
  private nextSpawnAtMs: number;
  private spawned = 0;
  private nextCustomerId = 1;
  private nextTicketNo = 1;
  private readonly allCustomers: Customer[] = [];
  private readonly allTickets: Ticket[] = [];
  private activeNo: number | null = null;
  private readonly rackDonuts: FriedDonut[] = [];
  private readonly shelfDonuts: FinishedDonut[] = [];
  /** Donuts on the glazing tray (balance.glaze.boards spots). */
  private readonly boards: (GlazeWork | null)[];
  private topWork: ToppingWork | null = null;
  /** The open box at the Box station (slot i holds a donut or nothing). */
  private readonly boxSlots: (FinishedDonut | undefined)[] = [];
  private readonly glazeMask: MaskTemplate;
  /** Donuts thrown away today (burnt or trashed), for the day summary. */
  private trashedCount = 0;
  private dayPhase: DayPhase;
  /** Donuts' worth of dough in the tub, and the quality of what's in it. */
  private doughLeft: number;
  private doughQ = 1;
  private doughWork: DoughWork | null = null;
  /** Glaze and toppings that missed the donut and are sitting on each tray. */
  private readonly trayMess = { glaze: 0, toppings: 0 };
  private dirt = 0;
  /** Today's invite (one a day), and whether you said yes. */
  private inviteId: string | null = null;
  private inviteAccepted = false;
  private tidyClose: boolean | null = null;
  /** When the window closes (with dayFlow, once open). */
  private dayEndsAtMs = Infinity;
  private windowClosed = false;
  private readonly supplies: Stock | null;
  /** Supplies used today, by id. */
  private readonly used: Stock = {};
  private friendsToday = 0;
  private nextFriendCheckMs = Infinity;
  private readonly friendship: Record<string, number> | null;
  /** Regulars who've come today (once a day each). */
  private readonly regularsToday = new Set<string>();

  constructor(private readonly deps: SessionDeps) {
    this.day = deps.day;
    this.isTutorial = !!deps.script;
    const base = deps.script ? deps.script.orders.length : forDay(deps.balance.customersPerDay, deps.day);
    this.walkUpsToday = deps.event ? Math.round(base * deps.event.customersMultiplier) : base;
    const pickups = deps.dayFlow && !deps.event ? forDay(deps.balance.deliveries.byDay, deps.day) + (deps.weather?.extraPickups ?? 0) : 0;
    this.customersToday = this.walkUpsToday + pickups;
    this.nextSpawnAtMs = deps.balance.spawn.firstDelaySec * 1000;
    // Hot days: the oil heats (and cools) faster.
    const fry = deps.balance.fry;
    this.fryer = new Fryer(deps.weather ? { ...fry, heatLagPerSec: fry.heatLagPerSec * deps.weather.heatLag } : fry);
    this.glazeMask = ringMask(deps.balance.glaze);
    this.boards = new Array<GlazeWork | null>(Math.max(1, deps.balance.glaze.boards ?? 1)).fill(null);
    this.dayPhase = deps.dayFlow ? 'prep' : 'open';
    this.doughLeft = deps.dayFlow || deps.trackDough ? 0 : Infinity;
    for (let i = 0; i < pickups; i++) this.addPickup();
    this.supplies = deps.stock ? { ...deps.stock } : null;
    this.friendship = deps.regulars ? { ...deps.regulars } : null;
  }

  /** Everything worth keeping about the day so far (see DaySnapshot). */
  snapshot(): DaySnapshot {
    // Donuts in the kitchen don't survive a reload: count them as thrown away.
    let kitchen = this.rackDonuts.length + this.shelfDonuts.length + this.fryer.count + (this.topWork ? 1 : 0);
    for (const w of this.boards) if (w) kitchen++;
    for (const d of this.boxSlots) if (d) kitchen++;
    const finite = (n: number) => (Number.isFinite(n) ? n : null);
    return {
      v: 1,
      now: this.now,
      phase: this.dayPhase,
      dayEndsAtMs: finite(this.dayEndsAtMs),
      windowClosed: this.windowClosed,
      nextSpawnAtMs: this.nextSpawnAtMs,
      spawned: this.spawned,
      nextCustomerId: this.nextCustomerId,
      nextTicketNo: this.nextTicketNo,
      customers: this.allCustomers.map((c) => ({ ...c })),
      // Served orders keep their scores, not the donut drawings (they're big).
      tickets: this.allTickets.map((t) => ({
        ...t,
        results: { ...t.results, ...(t.results.packed ? { packed: t.results.packed.map((p) => ({ flavorId: p.flavorId, glazeScore: p.glazeScore, toppingScore: p.toppingScore })) } : {}) },
      })),
      activeNo: this.activeNo,
      trashed: this.trashedCount + kitchen,
      doughLeft: Number.isFinite(this.doughLeft) ? this.doughLeft : 0,
      doughQ: this.doughQ,
      trayMess: { ...this.trayMess },
      dirt: this.dirt,
      inviteId: this.inviteId,
      inviteAccepted: this.inviteAccepted,
      supplies: this.supplies ? { ...this.supplies } : null,
      used: { ...this.used },
      friendsToday: this.friendsToday,
      nextFriendCheckMs: finite(this.nextFriendCheckMs),
      friendship: this.friendship ? { ...this.friendship } : null,
      regularsToday: [...this.regularsToday],
      fryer: { oil: this.fryer.oil, temp: this.fryer.temp, target: this.fryer.target },
    };
  }

  /** Pick a saved day back up (call right after making the session for that day). */
  restore(s: DaySnapshot): void {
    this.now = s.now;
    this.dayPhase = s.phase;
    this.dayEndsAtMs = s.dayEndsAtMs ?? Infinity;
    this.windowClosed = s.windowClosed;
    this.nextSpawnAtMs = s.nextSpawnAtMs;
    this.spawned = s.spawned;
    this.nextCustomerId = s.nextCustomerId;
    this.nextTicketNo = s.nextTicketNo;
    this.allCustomers.length = 0;
    // Someone mid-order when the page went away just waits for it now.
    for (const c of s.customers) this.allCustomers.push({ ...c, state: c.state === 'ordering' ? 'waiting' : c.state });
    this.allTickets.length = 0;
    this.allTickets.push(...s.tickets);
    this.activeNo = s.activeNo;
    this.trashedCount = s.trashed;
    if (Number.isFinite(this.doughLeft)) this.doughLeft = s.doughLeft;
    this.doughQ = s.doughQ;
    this.trayMess.glaze = s.trayMess.glaze;
    this.trayMess.toppings = s.trayMess.toppings;
    this.dirt = s.dirt;
    this.inviteId = s.inviteId;
    this.inviteAccepted = s.inviteAccepted;
    if (this.supplies && s.supplies) Object.assign(this.supplies, s.supplies);
    Object.assign(this.used, s.used);
    this.friendsToday = s.friendsToday;
    this.nextFriendCheckMs = s.nextFriendCheckMs ?? Infinity;
    if (this.friendship && s.friendship) Object.assign(this.friendship, s.friendship);
    for (const id of s.regularsToday) this.regularsToday.add(id);
    this.fryer.oil = s.fryer.oil;
    this.fryer.temp = s.fryer.temp;
    this.fryer.target = s.fryer.target;
    this.events.emit('changed', undefined);
  }

  /** Today's weather, if the day has any. */
  get weather(): WeatherType | undefined {
    return this.deps.weather;
  }

  // ---- Regulars ----------------------------------------------------------------

  /** A customer's regular, if they are one. */
  regularOf(c: Customer): RegularDef | undefined {
    return c.regularId ? this.deps.customers.regulars?.list.find((r) => r.id === c.regularId) : undefined;
  }

  /** How well a regular knows you (0 = first visit). */
  friendshipOf(id: string): number {
    return this.friendship?.[id] ?? 0;
  }

  /** Every regular's friendship now, to save at the end of the day (null without regulars). */
  get regularsLevels(): Readonly<Record<string, number>> | null {
    return this.friendship;
  }

  /** A regular due today (their usual is on the menu, and they haven't come yet), picked at random. */
  private dueRegular(): RegularDef | undefined {
    const list = this.deps.customers.regulars?.list;
    if (!this.friendship || !list?.length) return undefined;
    const open = new Set(flavorsForDay(this.deps.menu, this.day).map((f) => f.id));
    const due = list.filter((r) => !this.regularsToday.has(r.id) && r.usual.every((f) => open.has(f)));
    return due.length ? this.deps.rng.pick(due) : undefined;
  }

  /** A morning pickup order: on the rail from the start, collected by a courier. */
  private addPickup(): void {
    const { menu, balance, rng, customers } = this.deps;
    const types = customers.types.filter((t) => t.delivery);
    if (!types.length) return;
    const type = rng.pick(types);
    const customer: Customer = { id: this.nextCustomerId++, typeId: type.id, state: 'waiting', arrivedAtMs: this.now, delivery: true };
    const order = generateOrder(menu, this.day, orderSizeRange(balance.deliveries.size, type.orderSize), type.favorites, balance.favoriteWeight, rng);
    const ticket: Ticket = {
      no: this.nextTicketNo++,
      customerId: customer.id,
      order,
      line: pickLine(type.lines.order, rng, { order: describeOrder(menu, order) }),
      status: 'open',
      takenAtMs: this.now,
      results: {},
      delivery: true,
    };
    customer.ticketNo = ticket.no;
    this.allCustomers.push(customer);
    this.allTickets.push(ticket);
    if (this.activeNo === null) this.activeNo = ticket.no;
  }

  // ---- Queries ---------------------------------------------------------------

  get timeMs(): number {
    return this.now;
  }

  /** Customers in line, front first (the front one may be mid-order). */
  get line(): Customer[] {
    return this.allCustomers.filter((c) => c.state === 'inLine' || c.state === 'ordering');
  }

  /** Walk-up customers who have ordered and are waiting, in ticket order. */
  get waiting(): Customer[] {
    return this.allCustomers.filter((c) => c.state === 'waiting' && !c.delivery);
  }

  /** Morning pickup orders not collected yet, in ticket order. */
  get pickups(): Customer[] {
    return this.allCustomers.filter((c) => c.delivery && c.state !== 'served');
  }

  get phase(): DayPhase {
    return this.dayPhase;
  }

  /** Today's pop-up event, if it is one. */
  get event(): PopupEvent | undefined {
    return this.deps.event;
  }

  /** Tickets not yet served, oldest first. */
  get openTickets(): Ticket[] {
    return this.allTickets.filter((t) => t.status !== 'served');
  }

  /** The ticket the Box station will serve. */
  get activeTicket(): Ticket | undefined {
    return this.activeNo === null ? undefined : this.ticket(this.activeNo);
  }

  /** Customers who have arrived so far today. */
  get arrivals(): number {
    return this.spawned;
  }

  get trashed(): number {
    return this.trashedCount;
  }

  /** Walk-up customers here now: in line, ordering or waiting (pickups don't count). */
  get activeCustomers(): number {
    let n = 0;
    for (const c of this.allCustomers) if (c.state !== 'served' && !c.delivery) n++;
    return n;
  }

  /** The customer at the front of the line (checked every frame, so no array is built). */
  private get frontOfLine(): Customer | undefined {
    for (const c of this.allCustomers) if (c.state === 'inLine' || c.state === 'ordering') return c;
    return undefined;
  }

  /** Customers in line (checked every frame while someone is due, so no array is built). */
  private get lineLength(): number {
    let n = 0;
    for (const c of this.allCustomers) if (c.state === 'inLine' || c.state === 'ordering') n++;
    return n;
  }

  get servedCount(): number {
    return this.allCustomers.filter((c) => c.state === 'served' && !c.wentHome).length;
  }

  /** Every walk-up has come (the window's closed, with dayFlow) and everyone (pickups too) is done. */
  get allServed(): boolean {
    const allCame = this.deps.dayFlow ? this.windowClosed : this.spawned === this.walkUpsToday;
    return allCame && this.allCustomers.every((c) => c.state === 'served');
  }

  /** Time left before the window closes (with dayFlow): the whole day before opening, 0 once it's closed. */
  get timeLeftMs(): number {
    const len = this.deps.balance.day.lengthSec * 1000;
    if (!this.deps.dayFlow) return Infinity;
    if (this.dayPhase === 'prep') return len;
    if (this.windowClosed) return 0;
    return Math.max(0, this.dayEndsAtMs - this.now);
  }

  /** The window has closed for the day: no more walk-ups. */
  get timeUp(): boolean {
    return this.windowClosed;
  }

  // ---- Supplies ----------------------------------------------------------------

  /** Are supplies counted today? (Not in the tutorial or tests.) */
  get tracksSupplies(): boolean {
    return this.supplies !== null;
  }

  /** How many of a supply are on hand (Infinity when supplies aren't counted). */
  stockOf(id: string): number {
    return this.supplies ? (this.supplies[id] ?? 0) : Infinity;
  }

  /** What's on hand now, to save at the end of the day (null when not counted). */
  get stock(): Readonly<Stock> | null {
    return this.supplies;
  }

  /** A station uses a serving of something (a glaze, a topping). False if there's none left. */
  useSupply(id: string): boolean {
    const ok = this.use(id);
    if (ok && this.supplies) this.events.emit('changed', undefined);
    return ok;
  }

  /** Use one of a supply. False if there's none left. */
  private use(id: string): boolean {
    if (!this.supplies) return true;
    if ((this.supplies[id] ?? 0) < 1) return false;
    this.supplies[id]!--;
    this.used[id] = (this.used[id] ?? 0) + 1;
    return true;
  }

  /** Scoop an ingredient into the bowl (starting a batch if needed). False if you're out of it. */
  scoop(id: string): boolean {
    if (!this.deps.balance.dough.ingredients.some((i) => i.id === id)) return false;
    if (this.stockOf(id) < 1) return false;
    const w = this.startDough()!;
    this.use(id);
    w.scoop(id);
    this.events.emit('changed', undefined);
    return true;
  }

  /** Top up the fryer with a jug of oil: 'ok', 'full' (no need), or 'none' (out of oil). */
  addOil(): 'ok' | 'full' | 'none' {
    if (this.fryer.oil >= 1) return 'full';
    if (this.stockOf('oil') < 1) return 'none';
    this.fryer.addOil();
    this.use('oil');
    this.events.emit('changed', undefined);
    return 'ok';
  }

  /** One of Ethan's friends drops off a pack of whatever you're lowest on (if anything's low). */
  private friendVisit(): void {
    const s = this.supplies;
    const friends = this.deps.customers.friends;
    if (!s || !friends?.names.length || !friends.lines.length) return;
    let low: { id: string; name: string; pack: number } | null = null;
    let lowest = 1;
    for (const it of this.deps.balance.supplies.items) {
      const r = (s[it.id] ?? 0) / it.pack;
      if (r < lowest) {
        lowest = r;
        low = it;
      }
    }
    if (!low) return;
    s[low.id] = (s[low.id] ?? 0) + low.pack;
    this.friendsToday++;
    const name = this.deps.rng.pick(friends.names);
    const line = pickLine(friends.lines, this.deps.rng, { item: low.name, qty: low.pack });
    this.events.emit('friend', { name, line, itemId: low.id, qty: low.pack });
    this.events.emit('changed', undefined);
  }

  /** The day is over: closed up (with dayFlow), or everyone served. */
  get isDayComplete(): boolean {
    return this.deps.dayFlow ? this.dayPhase === 'closed' : this.allServed;
  }

  customer(id: number): Customer | undefined {
    return this.allCustomers.find((c) => c.id === id);
  }

  ticket(no: number): Ticket | undefined {
    return this.allTickets.find((t) => t.no === no);
  }

  typeOf(customer: Customer): CustomerType {
    const t = this.deps.customers.types.find((x) => x.id === customer.typeId);
    if (!t) throw new Error(`unknown customer type ${customer.typeId}`);
    return t;
  }

  /** What a customer says when there are gift donuts in the box. */
  giftLine(): string {
    return pickLine(this.deps.customers.giftLines, this.deps.rng);
  }

  thanksLine(customer: Customer, tier: ThanksTier): string {
    return pickLine(this.typeOf(customer).lines.thanks[tier], this.deps.rng);
  }

  // ---- Time ------------------------------------------------------------------

  tick(dtMs: number): void {
    this.now += dtMs;
    this.fryer.tick(dtMs / 1000);
    if (this.fryer.burnt.length) {
      const slots = this.fryer.burnt.splice(0);
      this.trashedCount += slots.length;
      this.events.emit('burnt', { slots });
      this.events.emit('changed', undefined);
    }
    const { spawn } = this.deps.balance;
    // A regular who knows you well doesn't need to order: "the usual!", and it's on the rail.
    const front = this.friendship && this.dayPhase === 'open' ? this.frontOfLine : undefined;
    const reg = front?.state === 'inLine' ? this.regularOf(front) : undefined;
    if (front && reg && this.knowsYou(reg) === 'usual') {
      const t = this.takeOrder(front.id);
      this.finishOrdering(front.id);
      this.events.emit('usual', { customerId: front.id, name: reg.name, line: t.line });
    }
    if (this.dayPhase === 'open' && this.deps.dayFlow && !this.windowClosed) {
      if (this.now >= this.dayEndsAtMs) this.closeWindow();
      else if (this.now >= this.nextFriendCheckMs) {
        const sb = this.deps.balance.supplies;
        this.nextFriendCheckMs += sb.friendCheckSec * 1000;
        if (this.day >= (sb.friendsFromDay ?? 1) && this.friendsToday < sb.friendsPerDay && this.deps.rng.next() < sb.friendChance) this.friendVisit();
      }
    }
    // If the line is full (or enough people are already here), the next customer
    // arrives as soon as there's room; serving someone pushes that a little later.
    if (
      this.dayPhase === 'open' &&
      (this.deps.dayFlow ? !this.windowClosed : this.spawned < this.walkUpsToday) &&
      this.now >= this.nextSpawnAtMs &&
      this.lineLength < spawn.maxInLine &&
      this.activeCustomers < forDay(this.deps.balance.maxActiveByDay, this.day)
    ) {
      this.spawn();
      const gap = this.deps.rng.int(spawn.intervalSec.min * 1000, spawn.intervalSec.max * 1000);
      this.nextSpawnAtMs = this.now + gap * (this.deps.event?.spawnFactor ?? 1) * (this.deps.weather?.spawnFactor ?? 1);
    }
  }

  private spawn(): void {
    // Now and then it's a regular.
    const reg = this.friendship && this.deps.rng.next() < this.deps.balance.regulars.chance ? this.dueRegular() : undefined;
    if (reg) {
      this.regularsToday.add(reg.id);
      this.allCustomers.push({ id: this.nextCustomerId++, typeId: reg.type, state: 'inLine', arrivedAtMs: this.now, regularId: reg.id });
      this.spawned++;
      this.events.emit('changed', undefined);
      return;
    }
    const type = this.deps.rng.pick(this.deps.customers.types.filter((t) => !t.delivery));
    this.allCustomers.push({ id: this.nextCustomerId++, typeId: type.id, state: 'inLine', arrivedAtMs: this.now });
    this.spawned++;
    this.events.emit('changed', undefined);
  }

  // ---- The day ---------------------------------------------------------------

  /** Open the window: walk-up customers start coming, until the day's time is up. */
  openShop(): boolean {
    if (this.dayPhase !== 'prep') return false;
    this.dayPhase = 'open';
    this.nextSpawnAtMs = this.now + this.deps.balance.spawn.firstDelaySec * 1000;
    this.dayEndsAtMs = this.now + this.deps.balance.day.lengthSec * 1000;
    this.nextFriendCheckMs = this.now + this.deps.balance.supplies.friendCheckSec * 1000;
    this.events.emit('phase', this.dayPhase);
    this.events.emit('changed', undefined);
    return true;
  }

  /**
   * Time's up: the window closes. Anyone still in line (not ordered yet) goes
   * home; orders already taken still need finishing (or sending home).
   */
  private closeWindow(): void {
    this.windowClosed = true;
    for (const c of this.allCustomers) {
      if (c.state === 'inLine') {
        c.state = 'served';
        c.wentHome = true;
      }
    }
    this.events.emit('timeUp', undefined);
    this.events.emit('changed', undefined);
    this.checkClosing();
  }

  /** Close the window now, before time's up (out of supplies, or just done for the day). */
  closeEarly(): boolean {
    if (this.dayPhase !== 'open' || !this.deps.dayFlow || this.windowClosed) return false;
    this.closeWindow();
    return true;
  }

  /** Customers whose orders are taken but not served yet. */
  get unserved(): number {
    let n = 0;
    for (const c of this.allCustomers) if (c.state === 'waiting' || c.state === 'ordering') n++;
    return n;
  }

  /**
   * After time's up: send everyone still waiting home without their order
   * (they don't pay). For when you can't finish them (out of dough, say).
   */
  sendHome(): number {
    if (!this.windowClosed || this.dayPhase !== 'open') return 0;
    let n = 0;
    for (const c of this.allCustomers) {
      if (c.state !== 'waiting' && c.state !== 'ordering') continue;
      c.state = 'served';
      c.wentHome = true;
      const t = c.ticketNo !== undefined ? this.ticket(c.ticketNo) : undefined;
      if (t) t.status = 'served';
      n++;
    }
    this.activeNo = null;
    this.boxSlots.length = 0;
    this.events.emit('changed', undefined);
    this.checkClosing();
    return n;
  }

  /** Everyone's done (with dayFlow): time to clean up and close. */
  private checkClosing(): void {
    if (this.dayPhase !== 'open' || !this.allServed) return;
    if (this.deps.dayFlow) {
      this.dayPhase = 'closing';
      this.events.emit('phase', this.dayPhase);
      this.events.emit('changed', undefined);
    } else this.events.emit('dayComplete', undefined);
  }

  /** What still needs cleaning before closing (true = done). */
  get cleanup(): { glazeTray: boolean; toppingsTray: boolean; oil: boolean } {
    const at = this.deps.balance.cleanup.messDoneAt;
    return { glazeTray: this.trayMess.glaze <= at, toppingsTray: this.trayMess.toppings <= at, oil: this.dirt === 0 };
  }

  /** Close up after the last customer (clean or not): the day is done. */
  closeUp(): boolean {
    if (this.dayPhase !== 'closing') return false;
    const c = this.cleanup;
    this.tidyClose = c.glazeTray && c.toppingsTray && c.oil;
    this.dayPhase = 'closed';
    this.events.emit('phase', this.dayPhase);
    this.events.emit('changed', undefined);
    this.events.emit('dayComplete', undefined);
    return true;
  }

  // ---- Dough ------------------------------------------------------------------

  /** Donuts' worth of dough in the tub (Infinity when the day doesn't track dough). */
  get dough(): number {
    return this.doughLeft;
  }

  get doughQuality(): number {
    return this.doughQ;
  }

  /** The batch in the bowl at the Dough station, if any. */
  get doughBatch(): DoughWork | null {
    return this.doughWork;
  }

  /** Not even one more batch fits. */
  get tubFull(): boolean {
    return this.tubSpace < this.deps.balance.dough.batchSize;
  }

  /** Start a batch in the bowl (one at a time). */
  startDough(): DoughWork | null {
    if (this.doughWork) return this.doughWork;
    this.doughWork = new DoughWork(this.deps.balance.dough);
    this.events.emit('changed', undefined);
    return this.doughWork;
  }

  /** Room left in the tub (donuts' worth). */
  get tubSpace(): number {
    return Number.isFinite(this.doughLeft) ? this.deps.balance.dough.tubCapacity - this.doughLeft : Infinity;
  }

  /** The stirred batch goes in the tub. Null if it isn't ready, makes nothing, or doesn't fit. */
  finishDough(): { quality: number; added: number } | null {
    const w = this.doughWork;
    if (!w || w.stage !== 'ready' || w.yield < 1 || w.yield > this.tubSpace) return null;
    const added = w.yield;
    const left = Number.isFinite(this.doughLeft) ? this.doughLeft : 0;
    // The tub's quality is the mix of what's left and the new batch.
    this.doughQ = (this.doughQ * left + w.quality * added) / (left + added);
    if (Number.isFinite(this.doughLeft)) this.doughLeft += added;
    this.doughWork = null;
    this.events.emit('doughMade', { quality: w.quality });
    this.events.emit('changed', undefined);
    return { quality: w.quality, added };
  }

  /** Throw the batch in the bowl away. */
  trashDough(): boolean {
    if (!this.doughWork) return false;
    this.doughWork = null;
    this.events.emit('changed', undefined);
    return true;
  }

  // ---- Clean-up -----------------------------------------------------------------

  /** Mess on a tray (glaze or toppings that missed the donut). */
  messOn(tray: 'glaze' | 'toppings'): number {
    return this.trayMess[tray];
  }

  addMess(tray: 'glaze' | 'toppings', units: number): void {
    this.trayMess[tray] += units;
  }

  /** Older mess fades as new donuts go on the tray (it matches the art). */
  fadeMess(tray: 'glaze' | 'toppings', keep: number): void {
    this.trayMess[tray] *= keep;
  }

  /** Scrub a tray. Returns true once it's clean. */
  wipe(tray: 'glaze' | 'toppings', amount: number): boolean {
    const was = this.trayMess[tray];
    this.trayMess[tray] = Math.max(0, was - amount);
    const clean = this.trayMess[tray] <= this.deps.balance.cleanup.messDoneAt;
    if (clean) this.trayMess[tray] = 0;
    if (was !== this.trayMess[tray]) this.events.emit('changed', undefined);
    return clean;
  }

  /** How dirty the fryer oil is (donuts fried since it was last filtered). */
  get oilDirt(): number {
    return this.dirt;
  }

  filterOil(): void {
    if (this.dirt === 0) return;
    this.dirt = 0;
    this.events.emit('changed', undefined);
  }

  // ---- Orders ----------------------------------------------------------------

  /** Take the front customer's order. They stay at the counter until finishOrdering(). */
  takeOrder(customerId: number): Ticket {
    const front = this.line[0];
    if (!front || front.id !== customerId || front.state !== 'inLine') {
      throw new Error(`customer ${customerId} is not at the front of the line`);
    }
    const { menu, balance, rng } = this.deps;
    const type = this.typeOf(front);
    const size = orderSizeRange(forDay(balance.orderSizeByDay, this.day), type.orderSize);
    const scripted = this.deps.script?.orders[this.nextTicketNo - 1];
    const reg = this.regularOf(front);
    const order = scripted
      ? { flavors: [...scripted.flavors], boxId: scripted.boxId }
      : reg
        ? { flavors: [...reg.usual], boxId: boxFor(menu, reg.usual.length).id }
        : generateOrder(menu, this.day, size, type.favorites, balance.favoriteWeight, rng);
    const ticket: Ticket = {
      no: this.nextTicketNo++,
      customerId,
      order,
      line: pickLine(reg ? reg.lines[this.knowsYou(reg)] : type.lines.order, rng, { order: describeOrder(menu, order) }),
      status: 'open',
      takenAtMs: this.now,
      results: {},
    };
    this.allTickets.push(ticket);
    front.state = 'ordering';
    front.ticketNo = ticket.no;
    if (this.activeNo === null) this.activeNo = ticket.no;
    this.events.emit('changed', undefined);
    return ticket;
  }

  /** Which lines a regular uses: hello (new), warm, or usual (they know you well). */
  private knowsYou(r: RegularDef): 'hello' | 'warm' | 'usual' {
    const lv = this.friendshipOf(r.id);
    return lv >= this.deps.balance.regulars.usualAt ? 'usual' : lv > 0 ? 'warm' : 'hello';
  }

  /** The customer steps aside to the waiting area. */
  finishOrdering(customerId: number): void {
    const c = this.customer(customerId);
    if (!c || c.state !== 'ordering') throw new Error(`customer ${customerId} is not ordering`);
    c.state = 'waiting';
    this.events.emit('changed', undefined);
  }

  /** Choose which open ticket the Box station serves. Returns false if it can't be selected. */
  selectTicket(no: number): boolean {
    const t = this.ticket(no);
    if (!t || t.status !== 'open') return false;
    this.activeNo = no;
    this.fitBox();
    this.events.emit('changed', undefined);
    return true;
  }

  // ---- Frying -----------------------------------------------------------------

  /** Fried donuts on the cooling rack, oldest first. The Glaze station works from here. */
  get rack(): readonly FriedDonut[] {
    return this.rackDonuts;
  }

  get rackFull(): boolean {
    return this.rackDonuts.length >= this.deps.balance.fry.rackCapacity;
  }

  /** Drop one raw donut into the vat. Returns its slot, or -1 if it can't (full, no oil or no dough). */
  dropDonut(): number {
    if (this.doughLeft < 1) return -1;
    const slot = this.fryer.drop();
    if (slot < 0) return slot;
    if (Number.isFinite(this.doughLeft)) {
      this.doughLeft--;
      this.fryer.slots[slot]!.dough = this.doughQ;
      this.dirt++;
    }
    this.events.emit('dropped', { frying: this.fryer.count, slots: this.fryer.slots.length });
    this.events.emit('changed', undefined);
    return slot;
  }

  flipDonut(slot: number): boolean {
    return this.fryer.flip(slot);
  }

  /** Take a donut out of the oil onto the rack. Fails (null) if the rack is full. */
  pullDonut(slot: number): FriedDonut | null {
    if (this.rackFull || !this.fryer.slots[slot]) return null;
    const d = this.fryer.take(slot);
    if (!d) return null;
    this.rackDonuts.push(d);
    this.events.emit('pulled', { score: d.score });
    this.events.emit('changed', undefined);
    return d;
  }

  /** Take every donut out onto the rack (as many as fit). Returns the slots taken. */
  pullAll(): number[] {
    const taken: number[] = [];
    for (let i = 0; i < this.fryer.slots.length; i++) {
      if (this.fryer.slots[i] && !this.rackFull) {
        const d = this.fryer.take(i)!;
        this.rackDonuts.push(d);
        taken.push(i);
        this.events.emit('pulled', { score: d.score });
      }
    }
    if (taken.length) this.events.emit('changed', undefined);
    return taken;
  }

  /** Throw a donut in the oil away (to fry a fresh one). */
  trashDonut(slot: number): boolean {
    const ok = this.fryer.trash(slot);
    if (ok) this.trashed1();
    return ok;
  }

  /** Throw every donut on the rack away. Returns how many. */
  trashRack(): number {
    const n = this.rackDonuts.length;
    if (!n) return 0;
    this.rackDonuts.length = 0;
    this.trashedCount += n;
    this.events.emit('changed', undefined);
    return n;
  }

  /** Throw one donut on the rack away. */
  trashRackDonut(index: number): boolean {
    if (!this.rackDonuts[index]) return false;
    this.rackDonuts.splice(index, 1);
    this.trashed1();
    return true;
  }

  // ---- Glazing ----------------------------------------------------------------

  /** The donuts on the glazing tray, by spot (null = free). */
  get glazeBoards(): readonly (GlazeWork | null)[] {
    return this.boards;
  }

  /** The first donut on the glazing tray, if any. */
  get glazeWork(): GlazeWork | null {
    for (const w of this.boards) if (w) return w;
    return null;
  }

  private freeBoard(slot?: number): number {
    if (slot !== undefined && slot >= 0 && slot < this.boards.length && !this.boards[slot]) return slot;
    return this.boards.indexOf(null);
  }

  /** The spot of a donut on the tray (the first one with glaze if not given). */
  private boardSlot(slot?: number): number {
    if (slot !== undefined) return this.boards[slot] ? slot : -1;
    let first = -1;
    for (let i = 0; i < this.boards.length; i++) {
      const w = this.boards[i];
      if (!w) continue;
      if (w.hasGlaze) return i;
      if (first < 0) first = i;
    }
    return first;
  }

  /** Finished (glazed, maybe topped) donuts on the shelf, oldest first, waiting to be boxed. */
  get shelf(): readonly FinishedDonut[] {
    return this.shelfDonuts;
  }

  /** Full counts the donut on the toppings board: its spot is kept for it. */
  get shelfFull(): boolean {
    return this.shelfDonuts.length + (this.topWork ? 1 : 0) >= this.deps.balance.glaze.shelfCapacity;
  }

  /** Move a rack donut onto the glazing tray (a free spot, or `slot`). */
  startGlazing(rackIndex: number, slot?: number): GlazeWork | null {
    const at = this.freeBoard(slot);
    const d = this.rackDonuts[rackIndex];
    if (at < 0 || !d) return null;
    this.rackDonuts.splice(rackIndex, 1);
    const w = new GlazeWork(d.id, d, this.deps.menu, this.deps.balance.glaze, this.glazeMask);
    this.boards[at] = w;
    this.events.emit('changed', undefined);
    return w;
  }

  /** Bring a glazed donut back from the shelf to add more glaze (its toppings stay). */
  reglaze(shelfIndex: number, slot?: number): GlazeWork | null {
    const at = this.freeBoard(slot);
    const d = this.shelfDonuts[shelfIndex];
    if (at < 0 || !d) return null;
    this.shelfDonuts.splice(shelfIndex, 1);
    const { id, fry, layers, ...extra } = d;
    const w = new GlazeWork(id, fry, this.deps.menu, this.deps.balance.glaze, this.glazeMask, { layers, extra });
    this.boards[at] = w;
    this.events.emit('changed', undefined);
    return w;
  }

  /** Done glazing (one donut): it goes to the shelf. Null if there's nothing to finish or the shelf is full. */
  finishGlazing(slot?: number): FinishedDonut | null {
    const at = this.boardSlot(slot);
    const w = at >= 0 ? this.boards[at] : null;
    if (!w || !w.hasGlaze || this.shelfFull) return null;
    const d = w.finish();
    this.shelfDonuts.push(d);
    this.boards[at] = null;
    this.events.emit('changed', undefined);
    return d;
  }

  /** Redo: throw away a donut on the tray (you'll glaze another one). */
  trashGlazing(slot?: number): boolean {
    const at = this.boardSlot(slot);
    if (at < 0) return false;
    this.boards[at] = null;
    this.trashed1();
    return true;
  }

  trashShelfDonut(index: number): boolean {
    if (!this.shelfDonuts[index]) return false;
    this.shelfDonuts.splice(index, 1);
    this.trashed1();
    return true;
  }

  // ---- Toppings ---------------------------------------------------------------

  /** The donut on the toppings board, if any. */
  get toppingWork(): ToppingWork | null {
    return this.topWork;
  }

  /** Move a shelf donut onto the toppings board (one at a time). */
  startToppings(shelfIndex: number): ToppingWork | null {
    if (this.topWork) return null;
    const d = this.shelfDonuts[shelfIndex];
    if (!d) return null;
    this.shelfDonuts.splice(shelfIndex, 1);
    this.topWork = new ToppingWork(d, this.deps.menu, this.deps.balance.toppings, this.deps.balance.glaze);
    this.events.emit('changed', undefined);
    return this.topWork;
  }

  /** Done: the donut goes back on the shelf (its spot was kept). */
  finishToppings(): FinishedDonut | null {
    if (!this.topWork) return null;
    const d = this.topWork.finish();
    this.topWork = null;
    this.shelfDonuts.push(d);
    this.events.emit('changed', undefined);
    return d;
  }

  /** Redo: throw away the donut on the toppings board. */
  trashToppings(): boolean {
    if (!this.topWork) return false;
    this.topWork = null;
    this.trashed1();
    return true;
  }

  // ---- Box --------------------------------------------------------------------

  /** The box being packed for the selected order (null if no order is selected). */
  get boxChoice(): string | null {
    const t = this.activeTicket;
    return t ? (t.packBoxId ?? t.order.boxId) : null;
  }

  /** Slots in the selected order's box (0 if no order is selected). */
  get boxSize(): number {
    const t = this.activeTicket;
    const id = this.boxChoice;
    return t ? (this.deps.menu.boxes.find((b) => b.id === id)?.size ?? t.order.flavors.length) : 0;
  }

  /**
   * Pack the selected order in a different box (a single, the trio, the
   * flight…). A bigger box leaves room for gift donuts; a smaller one may not
   * fit the order. Donuts past a smaller box's end move to free slots or back
   * to the shelf.
   */
  chooseBox(boxId: string): boolean {
    const t = this.activeTicket;
    if (!t || !this.deps.menu.boxes.some((b) => b.id === boxId)) return false;
    t.packBoxId = boxId;
    this.fitBox();
    this.events.emit('changed', undefined);
    return true;
  }

  /** What's in the open box, slot by slot. */
  get box(): readonly (FinishedDonut | undefined)[] {
    return this.boxSlots;
  }

  get boxCount(): number {
    let n = 0;
    for (const d of this.boxSlots) if (d) n++;
    return n;
  }

  /** Which flavour a donut is, if it exactly matches one. */
  flavorOf(d: FinishedDonut): string | null {
    return identifyFlavor(d, this.deps.menu);
  }

  /**
   * Put a shelf donut in the box: in `slot` if it's free, otherwise the first
   * free slot. Returns the slot used, or -1 if there's no order or no room.
   */
  boxDonut(shelfIndex: number, slot?: number): number {
    const size = this.boxSize;
    const d = this.shelfDonuts[shelfIndex];
    if (!d || !size) return -1;
    let to = slot !== undefined && slot >= 0 && slot < size && !this.boxSlots[slot] ? slot : -1;
    for (let i = 0; i < size && to < 0; i++) if (!this.boxSlots[i]) to = i;
    if (to < 0) return -1;
    this.shelfDonuts.splice(shelfIndex, 1);
    this.boxSlots[to] = d;
    this.events.emit('changed', undefined);
    return to;
  }

  /** Take a donut out of the box, back onto the shelf. False if the shelf is full. */
  unboxDonut(slot: number): boolean {
    const d = this.boxSlots[slot];
    if (!d || this.shelfFull) return false;
    this.boxSlots[slot] = undefined;
    this.shelfDonuts.push(d);
    this.events.emit('changed', undefined);
    return true;
  }

  /** Move a boxed donut to another slot, swapping with whatever is there. */
  moveBoxDonut(from: number, to: number): boolean {
    const d = this.boxSlots[from];
    if (!d || from === to || to < 0 || to >= this.boxSize) return false;
    this.boxSlots[from] = this.boxSlots[to];
    this.boxSlots[to] = d;
    this.events.emit('changed', undefined);
    return true;
  }

  /** After the box size changes (another order selected): pull donuts past the end into free slots, or shelve them. */
  private fitBox(): void {
    const size = this.boxSize;
    if (!size) return;
    for (let i = size; i < this.boxSlots.length; i++) {
      const d = this.boxSlots[i];
      if (!d) continue;
      let free = -1;
      for (let k = 0; k < size && free < 0; k++) if (!this.boxSlots[k]) free = k;
      if (free >= 0) this.boxSlots[free] = d;
      // Rare (a smaller box picked while the shelf is full): the shelf goes one over.
      else this.shelfDonuts.push(d);
    }
    if (this.boxSlots.length > size) this.boxSlots.length = size;
  }

  // ---- Serving ----------------------------------------------------------------

  /**
   * Close the lid on the active ticket's box and hand it straight to that
   * customer. The box score is about the right donuts in the right slots; each
   * ordered flavour is then matched to a boxed donut to score how well it was
   * fried, glazed and topped. Ordered donuts with no match score 0.
   */
  serveActiveTicket(): ServedEvent {
    const t = this.activeTicket;
    if (!t || t.status !== 'open') throw new Error('no order to serve');
    const c = this.customer(t.customerId);
    if (!c || (c.state !== 'waiting' && c.state !== 'ordering')) throw new Error('customer is not here');

    const { menu, balance } = this.deps;
    const expected = t.order.flavors;
    const needed = expected.length;
    const donuts = [...this.boxSlots];
    this.boxSlots.length = 0;
    // The box comes out of stock; out of that box, it goes out in a napkin.
    const napkin = !this.use(boxStockId(t.packBoxId ?? t.order.boxId));
    const identified = donuts.map((d) => (d ? identifyFlavor(d, menu) : undefined));
    const flavorById = (id: string) => menu.flavors.find((f) => f.id === id)!;
    const glazeQ = (d: FinishedDonut, id: string) => glazeScoreFor(d, flavorById(id), balance.glaze);
    const topQ = (d: FinishedDonut, id: string) => toppingScoreFor(d, flavorById(id), menu, balance.toppings);
    const match = matchDonuts(expected, donuts, identified, (d, id) => glazeQ(d, id) + topQ(d, id));
    const packed: PackedDonut[] = expected.map((flavorId, i) => {
      const donut = match[i]! >= 0 ? donuts[match[i]!] : undefined;
      return donut
        ? { flavorId, donut, glazeScore: glazeQ(donut, flavorId), toppingScore: topQ(donut, flavorId) }
        : { flavorId, glazeScore: 0, toppingScore: 0 };
    });

    const fried = packed.flatMap((p) => (p.donut ? [p.donut.fry] : []));
    const fry = fryResultFromDonuts(t.no, fried, balance.fry);
    // Missing donuts count as zero.
    fry.score = Math.round((fry.score * fried.length) / needed);
    const avg = (f: (p: PackedDonut) => number) => Math.round((packed.reduce((s, p) => s + f(p), 0) / needed) * 100);
    t.results = {
      fry,
      glaze: { score: avg((p) => p.glazeScore) },
      toppings: { score: avg((p) => p.toppingScore) },
      box: scoreBox(expected, identified, balance.box),
      packed,
      ...(napkin ? { napkin } : {}),
      missing: needed - fried.length,
    };

    const { afterServeSec } = balance;
    this.nextSpawnAtMs = Math.max(this.nextSpawnAtMs, this.now + this.deps.rng.int(afterServeSec.min * 1000, afterServeSec.max * 1000));
    t.status = 'served';
    t.servedAtMs = this.now;
    c.state = 'served';
    this.activeNo = this.allTickets.find((x) => x.status === 'open')?.no ?? null;
    if (napkin) t.results.box!.score = Math.round(t.results.box!.score / 2);
    const waitMs = this.now - t.takenAtMs;
    const score = scoreOrder(
      { fry: t.results.fry!.score, glaze: t.results.glaze!.score, toppings: t.results.toppings!.score, box: t.results.box!.score },
      waitMs / 1000,
      this.typeOf(c).patienceSec * (this.deps.weather?.patience ?? 1),
      needed,
      balance.scoring,
      t.results.box!.gifts,
    );
    // A pop-up crowd tips more.
    if (this.deps.event) score.tip = Math.round(score.tip * this.deps.event.tipMultiplier * 100) / 100;
    // Rainy-day customers are grateful you're open.
    if (this.deps.weather && this.deps.weather.tip !== 1) score.tip = Math.round(score.tip * this.deps.weather.tip * 100) / 100;
    // A poor order pays less (and no tip); an awful one pays nothing and takes some back out of the tip jar.
    const price = orderPrice(menu, t.order);
    const pay = paymentFor(score.total, score.tier, balance.payment);
    const sale = Math.round(price * pay.share * 100) / 100;
    if (!pay.tips) {
      score.tip = 0;
      score.giftTip = 0;
    }
    if (pay.takesFromJar > 0) score.tip = -Math.min(pay.takesFromJar, Math.max(0, this.tipJar));
    t.results.price = price;
    t.results.score = score;
    // A regular gets to know you better (or not).
    const reg = this.regularOf(c);
    if (reg && this.friendship) {
      const before = this.friendshipOf(reg.id);
      const step = score.tier === 'great' || score.tier === 'good' ? 1 : score.tier === 'bad' ? -1 : 0;
      const after = Math.max(0, Math.min(balance.regulars.maxLevel, before + step));
      this.friendship[reg.id] = after;
      t.results.regular = { name: reg.name, before, after };
    }
    // A happy walk-up customer may invite you to their event (one invite a day).
    if (this.deps.dayFlow && !c.delivery && !this.deps.event && !this.inviteId && this.deps.events?.length && this.day >= (balance.events.fromDay ?? 1)) {
      const chance = balance.events.inviteChance[score.tier] + (score.gifts > 0 ? balance.events.giftBonus : 0);
      if (this.deps.rng.next() < chance) {
        this.inviteId = this.deps.rng.pick(this.deps.events).id;
        t.results.invite = this.inviteId;
      }
    }
    t.results.sale = sale;
    const event: ServedEvent = { customer: c, ticket: t, waitMs, score, sale };
    this.events.emit('served', event);
    this.events.emit('changed', undefined);
    // Last order out: time to clean up and close.
    this.checkClosing();
    return event;
  }

  /** The day's best donut: from the best-scoring order, the donut that matched its flavour best. */
  get bestDonut(): FinishedDonut | undefined {
    let best: Ticket | undefined;
    for (const t of this.allTickets) {
      const s = t.results.score;
      if (s && t.results.packed?.some((p) => p.donut) && (!best || s.total > best.results.score!.total)) best = t;
    }
    let pick: PackedDonut | undefined;
    for (const p of best?.results.packed ?? []) if (p.donut && (!pick || p.glazeScore + p.toppingScore > pick.glazeScore + pick.toppingScore)) pick = p;
    return pick?.donut;
  }

  /** Tips so far today (what an awful order can take back). */
  private get tipJar(): number {
    let tips = 0;
    for (const t of this.allTickets) if (t.results.score) tips += t.results.score.tip;
    return tips;
  }

  /** Donuts' worth made but not sold: on the rack, shelf, trays and in the box, frying, and dough left in the tub or bowl. */
  get unsold(): number {
    let n = this.rackDonuts.length + this.shelfDonuts.length + this.fryer.count + (this.topWork ? 1 : 0);
    for (const w of this.boards) if (w) n++;
    for (const d of this.boxSlots) if (d) n++;
    if (Number.isFinite(this.doughLeft)) n += this.doughLeft;
    if (this.doughWork) n += this.doughWork.yield;
    return n;
  }

  /** The invite a customer made today (an events.json event), if any. */
  get invite(): PopupEvent | undefined {
    return this.inviteId ? this.deps.events?.find((e) => e.id === this.inviteId) : undefined;
  }

  get inviteWasAccepted(): boolean {
    return this.inviteAccepted;
  }

  /** Say yes (or no) to today's invite: yes makes tomorrow a pop-up day. */
  answerInvite(accept: boolean): void {
    if (!this.inviteId) return;
    this.inviteAccepted = accept;
    this.events.emit('changed', undefined);
  }

  /** Totals for the day so far (the summary at the end of the day). */
  summary(): DaySummary {
    const served = this.allTickets.filter((t) => t.status === 'served' && t.results.score);
    const tiers = { great: 0, good: 0, okay: 0, bad: 0 };
    let total = 0;
    let best = 0;
    let sales = 0;
    let tips = 0;
    let gifts = 0;
    for (const t of served) {
      const s = t.results.score!;
      total += s.total;
      best = Math.max(best, s.total);
      tips += s.tip;
      sales += t.results.sale ?? 0;
      tiers[s.tier]++;
      gifts += s.gifts;
    }
    return {
      day: this.day,
      served: served.length,
      averageScore: served.length ? Math.round(total / served.length) : 0,
      bestScore: best,
      sales: Math.round(sales * 100) / 100,
      tips: Math.round(tips * 100) / 100,
      trashed: this.trashedCount,
      ...this.costs(),
      wentHome: this.allCustomers.filter((c) => c.wentHome).length,
      tiers,
      gifts,
      pickups: served.filter((t) => t.delivery).length,
      ...(this.deps.event ? { event: this.deps.event.name } : {}),
      ...(this.inviteAccepted && this.invite ? { nextEvent: this.invite.name } : {}),
      tidy: this.tidyClose,
      tidyBonus: this.tidyClose ? this.deps.balance.cleanup.tidyBonus : 0,
    };
  }

  /** Waste and what today's supplies cost (only when supplies are counted). */
  private costs(): { wasted: number; wasteCost: number; suppliesCost: number; profit: number } {
    const sb = this.deps.balance.supplies;
    const wasted = this.trashedCount + this.unsold;
    const round = (n: number) => Math.round(n * 100) / 100;
    let suppliesCost = 0;
    for (const [id, n] of Object.entries(this.used)) suppliesCost += unitCost(sb, id) * n;
    const counted = this.supplies !== null;
    let earned = this.deps.balance.cleanup.tidyBonus * (this.tidyClose ? 1 : 0);
    for (const t of this.allTickets) if (t.results.score) earned += t.results.score.tip + (t.results.sale ?? 0);
    return {
      wasted,
      wasteCost: counted ? round(wasted * doughCostPerDonut(sb, this.deps.balance.dough)) : 0,
      suppliesCost: counted ? round(suppliesCost) : 0,
      profit: round(earned - (counted ? suppliesCost : 0)),
    };
  }

  private trashed1(): void {
    this.trashedCount++;
    this.events.emit('changed', undefined);
  }
}
