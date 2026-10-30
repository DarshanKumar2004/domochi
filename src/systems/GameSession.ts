// One day at the trailer: customers arriving, orders, tickets and serving.
// Pure logic driven by tick(dtMs); scenes render from it and call its actions.
import { donutsFromResult, Fryer, fryResultFromDonuts, type FriedDonut, type FryResult } from '../stations/fry';
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

/** open: being made · boxed: in the player's hands · served: handed over. */
export type TicketStatus = 'open' | 'boxed' | 'served';

export interface Ticket {
  no: number;
  customerId: number;
  order: Order;
  /** What the customer said when ordering. */
  line: string;
  status: TicketStatus;
  takenAtMs: number;
  servedAtMs?: number;
  /** Per-station results, filled in as the order moves through the kitchen. */
  results: { fry?: FryResult };
}

export interface ServedEvent {
  customer: Customer;
  ticket: Ticket;
  waitMs: number;
}

export type HandResult =
  | { ok: true; ticket: Ticket; waitMs: number }
  | { ok: false; reason: 'noBox' | 'notWaiting' }
  | { ok: false; reason: 'notMine'; line: string };

export interface SessionEvents extends Record<string, unknown> {
  /** Anything visible changed (customers, tickets, selection, box in hand). */
  changed: undefined;
  served: ServedEvent;
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
  private heldNo: number | null = null;
  private readonly rackDonuts: FriedDonut[] = [];

  constructor(private readonly deps: SessionDeps) {
    this.day = deps.day;
    this.customersToday = forDay(deps.balance.customersPerDay, deps.day);
    this.nextSpawnAtMs = deps.balance.spawn.firstDelaySec * 1000;
    this.fryer = new Fryer(deps.balance.fry);
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

  /** The ticket the stations are working on. */
  get activeTicket(): Ticket | undefined {
    return this.activeNo === null ? undefined : this.ticket(this.activeNo);
  }

  /** The boxed order in the player's hands, if any. */
  get heldTicket(): Ticket | undefined {
    return this.heldNo === null ? undefined : this.ticket(this.heldNo);
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
    const { spawn } = this.deps.balance;
    // If the line is full, the next customer arrives as soon as there's room.
    if (this.spawned < this.customersToday && this.now >= this.nextSpawnAtMs && this.line.length < spawn.maxInLine) {
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

  // ---- Actions ---------------------------------------------------------------

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

  /** Choose which open ticket the stations work on. Returns false if it can't be selected. */
  selectTicket(no: number): boolean {
    const t = this.ticket(no);
    if (!t || t.status !== 'open') return false;
    this.activeNo = no;
    this.events.emit('changed', undefined);
    return true;
  }

  /** Fried donuts on the cooling rack, oldest first (from prep batches). */
  get rack(): readonly FriedDonut[] {
    return this.rackDonuts;
  }

  /** Ticket whose donuts are in the fryer right now (undefined for a prep batch). */
  get fryingTicket(): Ticket | undefined {
    const no = this.fryer.batch?.ticketNo;
    return no == null ? undefined : this.ticket(no);
  }

  /** The active ticket, if it still needs frying. */
  private get ticketToFry(): Ticket | undefined {
    const t = this.activeTicket;
    return t && t.status === 'open' && !t.results.fry ? t : undefined;
  }

  /** What Drop would fry right now: the active ticket's donuts, or a prep batch for the rack. */
  get nextDrop(): { ticketNo: number | null; count: number } {
    const t = this.ticketToFry;
    return t ? { ticketNo: t.no, count: t.order.flavors.length } : { ticketNo: null, count: this.deps.balance.fry.prepBatchSize };
  }

  get canStartFrying(): boolean {
    return this.fryer.canDrop;
  }

  /** Drop donuts: for the active ticket if it needs frying, otherwise a prep batch for the rack. */
  startFrying(): { ticketNo: number | null; count: number } {
    if (!this.canStartFrying) throw new Error('cannot start frying now');
    const drop = this.nextDrop;
    this.fryer.drop(drop.ticketNo, drop.count);
    this.events.emit('changed', undefined);
    return drop;
  }

  /**
   * Lift the batch out. A ticket batch's score is stored on that ticket; a prep
   * batch goes to the cooling rack (anything past its capacity is thrown away).
   */
  pullFry(): FryResult {
    const result = this.fryer.pull();
    const t = result.ticketNo === null ? undefined : this.ticket(result.ticketNo);
    if (t) {
      t.results.fry = result;
    } else {
      const room = this.deps.balance.fry.rackCapacity - this.rackDonuts.length;
      this.rackDonuts.push(...donutsFromResult(result, this.deps.balance.fry).slice(0, Math.max(0, room)));
    }
    this.events.emit('changed', undefined);
    return result;
  }

  /** Can the active ticket take its donuts from the rack instead of frying fresh? */
  get canUseRack(): boolean {
    const t = this.ticketToFry;
    return !!t && this.fryer.batch?.ticketNo !== t.no && this.rackDonuts.length >= t.order.flavors.length;
  }

  /** Give the active ticket the oldest donuts from the rack. */
  useRack(): FryResult {
    const t = this.ticketToFry;
    if (!t || !this.canUseRack) throw new Error('cannot use the rack now');
    const donuts = this.rackDonuts.splice(0, t.order.flavors.length);
    t.results.fry = fryResultFromDonuts(t.no, donuts, this.deps.balance.fry);
    this.events.emit('changed', undefined);
    return t.results.fry;
  }

  /** Close the box on the active ticket and pick it up. */
  boxActiveTicket(): Ticket {
    if (this.heldNo !== null) throw new Error('already holding a box');
    const t = this.activeTicket;
    if (!t) throw new Error('no active ticket');
    t.status = 'boxed';
    this.heldNo = t.no;
    this.activeNo = this.allTickets.find((x) => x.status === 'open')?.no ?? null;
    this.events.emit('changed', undefined);
    return t;
  }

  /** Hand the box in your hands to a waiting customer. */
  handTo(customerId: number): HandResult {
    const c = this.customer(customerId);
    if (!c || c.state !== 'waiting') return { ok: false, reason: 'notWaiting' };
    const held = this.heldTicket;
    if (!held) return { ok: false, reason: 'noBox' };
    if (held.customerId !== c.id) {
      return { ok: false, reason: 'notMine', line: pickLine(this.typeOf(c).lines.notMine, this.deps.rng, { ticket: c.ticketNo ?? '?' }) };
    }

    held.status = 'served';
    held.servedAtMs = this.now;
    c.state = 'served';
    this.heldNo = null;
    const waitMs = this.now - held.takenAtMs;
    this.events.emit('served', { customer: c, ticket: held, waitMs });
    this.events.emit('changed', undefined);
    if (this.isDayComplete) this.events.emit('dayComplete', undefined);
    return { ok: true, ticket: held, waitMs };
  }
}
