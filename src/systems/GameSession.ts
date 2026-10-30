// One day at the trailer: customers arriving, orders, tickets and serving.
// Pure logic driven by tick(dtMs); scenes render from it and call its actions.
//
// The kitchen is a production line: fried donuts go to the rack, rack donuts
// are glazed one at a time on the glazing board and go to the glazed shelf,
// and closing the box for an order packs the best-matching shelf donuts and
// hands them straight to that customer.
import { Fryer, fryResultFromDonuts, type FriedDonut, type FryResult } from '../stations/fry';
import { GlazeWork, glazeScoreFor, ringMask, type GlazedDonut, type MaskTemplate } from '../stations/glaze';
import { forDay, type Balance } from './balance';
import { pickLine, type CustomerType, type CustomersData, type ThanksTier } from './customers';
import { Emitter } from './events';
import type { Menu } from './menu';
import { describeOrder, generateOrder, orderSizeRange, type Order } from './orders';
import type { Rng } from './rng';

export type CustomerState = 'inLine' | 'ordering' | 'waiting' | 'served';

export interface Customer {
  id: number;
  typeId: string;
  state: CustomerState;
  arrivedAtMs: number;
  /** Set once their order is taken. */
  ticketNo?: number;
}

export type TicketStatus = 'open' | 'served';

/** One donut slot in a served order: what was asked for and what went in the box. */
export interface PackedDonut {
  flavorId: string;
  donut?: GlazedDonut;
  /** 0–1 glaze match for this flavour (0 if the slot was empty). */
  glazeScore: number;
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
  /** Filled in when the box is closed and served. */
  results: { fry?: FryResult; glaze?: { score: number }; packed?: PackedDonut[]; missing?: number };
}

export interface ServedEvent {
  customer: Customer;
  ticket: Ticket;
  waitMs: number;
}

export interface SessionEvents extends Record<string, unknown> {
  /** Anything visible changed (customers, tickets, selection, rack, shelf). */
  changed: undefined;
  served: ServedEvent;
  /** Donuts that burnt and were thrown out automatically. */
  burnt: { slots: number[] };
  dayComplete: undefined;
}

export interface SessionDeps {
  menu: Menu;
  customers: CustomersData;
  balance: Balance;
  day: number;
  rng: Rng;
}

export class GameSession {
  readonly events = new Emitter<SessionEvents>();
  readonly day: number;
  readonly customersToday: number;
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
  private readonly shelfDonuts: GlazedDonut[] = [];
  private work: GlazeWork | null = null;
  private readonly glazeMask: MaskTemplate;
  /** Donuts thrown away today (burnt or trashed), for the day summary. */
  private trashedCount = 0;

  constructor(private readonly deps: SessionDeps) {
    this.day = deps.day;
    this.customersToday = forDay(deps.balance.customersPerDay, deps.day);
    this.nextSpawnAtMs = deps.balance.spawn.firstDelaySec * 1000;
    this.fryer = new Fryer(deps.balance.fry);
    this.glazeMask = ringMask(deps.balance.glaze);
  }

  // ---- Queries ---------------------------------------------------------------

  get timeMs(): number {
    return this.now;
  }

  /** Customers in line, front first (the front one may be mid-order). */
  get line(): Customer[] {
    return this.allCustomers.filter((c) => c.state === 'inLine' || c.state === 'ordering');
  }

  /** Customers who have ordered and are waiting, in ticket order. */
  get waiting(): Customer[] {
    return this.allCustomers.filter((c) => c.state === 'waiting');
  }

  /** Tickets not yet served, oldest first. */
  get openTickets(): Ticket[] {
    return this.allTickets.filter((t) => t.status !== 'served');
  }

  /** The ticket the Box station will serve. */
  get activeTicket(): Ticket | undefined {
    return this.activeNo === null ? undefined : this.ticket(this.activeNo);
  }

  get trashed(): number {
    return this.trashedCount;
  }

  /** Customers here now: in line, ordering or waiting. */
  get activeCustomers(): number {
    let n = 0;
    for (const c of this.allCustomers) if (c.state !== 'served') n++;
    return n;
  }

  /** Customers in line (checked every frame while someone is due, so no array is built). */
  private get lineLength(): number {
    let n = 0;
    for (const c of this.allCustomers) if (c.state === 'inLine' || c.state === 'ordering') n++;
    return n;
  }

  get servedCount(): number {
    return this.allCustomers.filter((c) => c.state === 'served').length;
  }

  get isDayComplete(): boolean {
    return this.spawned === this.customersToday && this.allCustomers.every((c) => c.state === 'served');
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
    // If the line is full (or enough people are already here), the next customer
    // arrives as soon as there's room; serving someone pushes that a little later.
    if (
      this.spawned < this.customersToday &&
      this.now >= this.nextSpawnAtMs &&
      this.lineLength < spawn.maxInLine &&
      this.activeCustomers < forDay(this.deps.balance.maxActiveByDay, this.day)
    ) {
      this.spawn();
      this.nextSpawnAtMs = this.now + this.deps.rng.int(spawn.intervalSec.min * 1000, spawn.intervalSec.max * 1000);
    }
  }

  private spawn(): void {
    const type = this.deps.rng.pick(this.deps.customers.types);
    this.allCustomers.push({ id: this.nextCustomerId++, typeId: type.id, state: 'inLine', arrivedAtMs: this.now });
    this.spawned++;
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
    const order = generateOrder(menu, this.day, size, type.favorites, balance.favoriteWeight, rng);
    const ticket: Ticket = {
      no: this.nextTicketNo++,
      customerId,
      order,
      line: pickLine(type.lines.order, rng, { order: describeOrder(menu, order) }),
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

  /** Drop one raw donut into the vat. Returns its slot, or -1 if it can't. */
  dropDonut(): number {
    const slot = this.fryer.drop();
    if (slot >= 0) this.events.emit('changed', undefined);
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
    this.events.emit('changed', undefined);
    return d;
  }

  /** Take every donut out onto the rack (as many as fit). Returns the slots taken. */
  pullAll(): number[] {
    const taken: number[] = [];
    for (let i = 0; i < this.fryer.slots.length; i++) {
      if (this.fryer.slots[i] && !this.rackFull) {
        this.rackDonuts.push(this.fryer.take(i)!);
        taken.push(i);
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

  /** Throw one donut on the rack away. */
  trashRackDonut(index: number): boolean {
    if (!this.rackDonuts[index]) return false;
    this.rackDonuts.splice(index, 1);
    this.trashed1();
    return true;
  }

  // ---- Glazing ----------------------------------------------------------------

  /** The donut on the glazing board, if any. */
  get glazeWork(): GlazeWork | null {
    return this.work;
  }

  /** Glazed donuts on the shelf, oldest first, waiting to be boxed. */
  get shelf(): readonly GlazedDonut[] {
    return this.shelfDonuts;
  }

  get shelfFull(): boolean {
    return this.shelfDonuts.length >= this.deps.balance.glaze.shelfCapacity;
  }

  /** Move a rack donut onto the glazing board (one at a time). */
  startGlazing(rackIndex: number): GlazeWork | null {
    if (this.work) return null;
    const d = this.rackDonuts[rackIndex];
    if (!d) return null;
    this.rackDonuts.splice(rackIndex, 1);
    this.work = new GlazeWork(d.id, d, this.deps.menu, this.deps.balance.glaze, this.glazeMask);
    this.events.emit('changed', undefined);
    return this.work;
  }

  /** Done glazing: the donut goes to the shelf. Null if there's nothing to finish or the shelf is full. */
  finishGlazing(): GlazedDonut | null {
    if (!this.work || !this.work.hasGlaze || this.shelfFull) return null;
    const d = this.work.finish();
    this.shelfDonuts.push(d);
    this.work = null;
    this.events.emit('changed', undefined);
    return d;
  }

  /** Redo: throw away the donut on the board (you'll glaze another one). */
  trashGlazing(): boolean {
    if (!this.work) return false;
    this.work = null;
    this.trashed1();
    return true;
  }

  trashShelfDonut(index: number): boolean {
    if (!this.shelfDonuts[index]) return false;
    this.shelfDonuts.splice(index, 1);
    this.trashed1();
    return true;
  }

  // ---- Serving ----------------------------------------------------------------

  /**
   * Close the box on the active ticket and hand it straight to that customer.
   * Packs the best-matching glazed donut from the shelf for each flavour; any
   * flavour with nothing left on the shelf goes in empty and scores 0.
   */
  serveActiveTicket(): ServedEvent {
    const t = this.activeTicket;
    if (!t || t.status !== 'open') throw new Error('no order to serve');
    const c = this.customer(t.customerId);
    if (!c || (c.state !== 'waiting' && c.state !== 'ordering')) throw new Error('customer is not here');

    const { menu, balance } = this.deps;
    const packed: PackedDonut[] = t.order.flavors.map((flavorId) => {
      const flavor = menu.flavors.find((f) => f.id === flavorId)!;
      let best = -1;
      let bestScore = -1;
      this.shelfDonuts.forEach((d, i) => {
        const s = glazeScoreFor(d, flavor, balance.glaze);
        if (s > bestScore) {
          bestScore = s;
          best = i;
        }
      });
      if (best < 0) return { flavorId, glazeScore: 0 };
      const donut = this.shelfDonuts.splice(best, 1)[0]!;
      return { flavorId, donut, glazeScore: bestScore };
    });

    const needed = t.order.flavors.length;
    const donuts = packed.flatMap((p) => (p.donut ? [p.donut.fry] : []));
    const fry = fryResultFromDonuts(t.no, donuts, balance.fry);
    // Empty slots count as zero.
    fry.score = Math.round((fry.score * donuts.length) / needed);
    t.results = {
      fry,
      glaze: { score: Math.round((packed.reduce((s, p) => s + p.glazeScore, 0) / needed) * 100) },
      packed,
      missing: needed - donuts.length,
    };

    const { afterServeSec } = balance;
    this.nextSpawnAtMs = Math.max(this.nextSpawnAtMs, this.now + this.deps.rng.int(afterServeSec.min * 1000, afterServeSec.max * 1000));
    t.status = 'served';
    t.servedAtMs = this.now;
    c.state = 'served';
    this.activeNo = this.allTickets.find((x) => x.status === 'open')?.no ?? null;
    const event: ServedEvent = { customer: c, ticket: t, waitMs: this.now - t.takenAtMs };
    this.events.emit('served', event);
    this.events.emit('changed', undefined);
    if (this.isDayComplete) this.events.emit('dayComplete', undefined);
    return event;
  }

  private trashed1(): void {
    this.trashedCount++;
    this.events.emit('changed', undefined);
  }
}
