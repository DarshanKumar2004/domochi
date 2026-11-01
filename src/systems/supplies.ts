// Supplies and money: what things cost, today's store prices, what a customer
// pays for an order, and what a wasted donut costs. Pure logic, no Phaser.
import type { DoughBalance } from '../stations/dough';
import type { ThanksTier } from './customers';

export type SupplyKind = 'ingredient' | 'box' | 'oil' | 'glaze' | 'topping';

export interface SupplyItem {
  /** An ingredient id (balance.dough), 'box-' + a menu box id, or 'oil'. */
  id: string;
  name: string;
  kind: SupplyKind;
  /** How many come in one pack at the store. */
  pack: number;
  /** Usual price of a pack, dollars. */
  price: number;
  /** Sold from this day on (greyed out in the store before then). */
  unlockDay?: number;
}

/** The stock id of a glaze or a topping. */
export function glazeStockId(glazeId: string): string {
  return `glaze-${glazeId}`;
}
export function toppingStockId(toppingId: string): string {
  return `topping-${toppingId}`;
}

export interface SuppliesBalance {
  items: SupplyItem[];
  /** What a new game starts with. */
  start: Record<string, number>;
  /** Store prices swing up to this share either way, day to day. */
  priceSwing: number;
  friendCheckSec: number;
  friendChance: number;
  friendsPerDay: number;
  /** No friends drop by before this day (a calm first few days). */
  friendsFromDay?: number;
  /** A friend's run to the store when you're out of baking materials. */
  errand?: ErrandBalance;
}

export interface PaymentBalance {
  full: number;
  okay: number;
  bad: number;
  awfulBelow: number;
  awfulTipJar: number;
}

export interface GuideItem {
  /** 'base' (the base coat loops) or a glaze id (that drizzle's stripes). */
  id: string;
  name: string;
  price: number;
}

export type Stock = Record<string, number>;

/** The stock id of a box. */
export function boxStockId(boxId: string): string {
  return `box-${boxId}`;
}

/** A fresh copy of the starting stock (every item listed, 0 if not in `start`). */
export function startingStock(b: SuppliesBalance): Stock {
  const s: Stock = {};
  for (const it of b.items) s[it.id] = b.start[it.id] ?? 0;
  return s;
}

/** A saved stock, with any item it's missing (new in the data) at 0. */
export function fillStock(saved: Stock | undefined, b: SuppliesBalance): Stock {
  if (!saved) return startingStock(b);
  const s: Stock = {};
  for (const it of b.items) s[it.id] = Math.max(0, Math.floor(saved[it.id] ?? 0));
  // The beignet's sugar used to be a glaze: a save from then keeps its sugar.
  if (saved['glaze-powdered-sugar'] !== undefined && saved['topping-powdered-sugar'] === undefined && 'topping-powdered-sugar' in s) {
    s['topping-powdered-sugar'] = Math.max(0, Math.floor(saved['glaze-powdered-sugar']));
  }
  return s;
}

/** A steady pseudo-random number in [-1, 1] for (day, id): the same every time you look. */
function wobble(day: number, id: string): number {
  let h = 2166136261 ^ day;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  h ^= h >>> 15;
  return ((h >>> 0) / 0xffffffff) * 2 - 1;
}

/** Today's store price for a pack: the usual price, up or down by up to priceSwing, to the nearest 5¢. */
export function priceOn(item: SupplyItem, day: number, swing: number): number {
  const p = item.price * (1 + swing * wobble(day, item.id));
  return Math.max(0.05, Math.round(p * 20) / 20);
}

/** What one unit of a supply usually costs (pack price ÷ pack size). */
export function unitCost(b: SuppliesBalance, id: string): number {
  const it = b.items.find((i) => i.id === id);
  return it ? it.price / it.pack : 0;
}

/** Ingredients' cost of one donut's worth of dough, at usual prices (a batch ÷ the donuts it makes). */
export function doughCostPerDonut(b: SuppliesBalance, dough: DoughBalance): number {
  let batch = 0;
  for (const [id, n] of Object.entries(dough.recipe)) batch += unitCost(b, id) * n;
  return batch / dough.batchSize;
}

export interface Payment {
  /** Share of the order price paid (0 = nothing). */
  share: number;
  /** False: no tip at all. */
  tips: boolean;
  /** Taken back out of the tip jar (an awful order). */
  takesFromJar: number;
}

/**
 * What a customer pays by how the order went: full price for good and great,
 * a bit less for okay, half and no tip for bad, and for an awful one (below
 * awfulBelow) nothing at all, and they take some back out of the tip jar.
 */
export function paymentFor(total: number, tier: ThanksTier, b: PaymentBalance): Payment {
  if (total < b.awfulBelow) return { share: 0, tips: false, takesFromJar: b.awfulTipJar };
  if (tier === 'bad') return { share: b.bad, tips: false, takesFromJar: 0 };
  if (tier === 'okay') return { share: b.okay, tips: true, takesFromJar: 0 };
  return { share: b.full, tips: true, takesFromJar: 0 };
}

/** mm:ss */
export function clockText(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Something mochi wants you to have in stock: at least \`want\` of it, and how much it matters. */
export interface ShopNeed {
  id: string;
  want: number;
  /** 1 = must have (you can't bake or serve without it), 2 = should have, 3 = nice to have. */
  priority: 1 | 2 | 3;
}

/** mochi's pick: buy \`packs\` of it (\`affordable\` = fits the cash left after higher picks). */
export interface ShopPick {
  id: string;
  packs: number;
  priority: 1 | 2 | 3;
  affordable: boolean;
}

/**
 * What a day needs: dough for three batches, a few boxes, a jug of oil (musts);
 * the glazes and toppings of the menu you can make, and flight boxes (shoulds);
 * anything else on sale under a pack (nice to have).
 */
export function shopNeeds(b: SuppliesBalance, recipe: Record<string, number>, onMenu: ReadonlySet<string>, day: number): ShopNeed[] {
  const needs: ShopNeed[] = [];
  for (const [id, n] of Object.entries(recipe)) needs.push({ id, want: n * 3, priority: 1 });
  needs.push({ id: 'box-trio', want: 6, priority: 1 }, { id: 'box-single', want: 5, priority: 1 }, { id: 'oil', want: 1, priority: 1 });
  for (const id of onMenu) needs.push({ id, want: 6, priority: 2 });
  needs.push({ id: 'box-flight', want: 2, priority: 2 });
  const listed = new Set(needs.map((n) => n.id));
  for (const it of b.items) if (!listed.has(it.id) && (it.unlockDay ?? 1) <= day) needs.push({ id: it.id, want: it.pack, priority: 3 });
  return needs;
}

/**
 * Turn the needs into packs to buy, most important first, out of the cash
 * you have: a must you can't afford is still listed (not affordable), so
 * mochi can say what's short; lower picks only use money left over.
 */
export function shoppingPlan(b: SuppliesBalance, needs: readonly ShopNeed[], stock: Stock, cash: number, priceOf: (id: string) => number): ShopPick[] {
  const picks: ShopPick[] = [];
  let left = cash;
  const sorted = [...needs].sort((x, y) => x.priority - y.priority || (stock[x.id] ?? 0) / Math.max(1, x.want) - (stock[y.id] ?? 0) / Math.max(1, y.want));
  for (const n of sorted) {
    const it = b.items.find((i) => i.id === n.id);
    if (!it) continue;
    const short = n.want - (stock[n.id] ?? 0);
    if (short <= 0) continue;
    const packs = Math.ceil(short / it.pack);
    const price = priceOf(it.id);
    let can = 0;
    while (can < packs && left >= price) {
      left -= price;
      can++;
    }
    if (can > 0) picks.push({ id: it.id, packs: can, priority: n.priority, affordable: true });
    if (can < packs && n.priority === 1) picks.push({ id: it.id, packs: packs - can, priority: 1, affordable: false });
  }
  return picks;
}

export interface ErrandBalance {
  /** Batches of dough a paid errand brings. */
  batches: number;
  /** Batches a friend brings for free when you can't afford the run. */
  rescueBatches: number;
  /** The friend's fee: this share of the supplies' cost, at least feeMin. */
  feeRate: number;
  feeMin: number;
  /** How long you've been out of materials before a friend turns up, seconds. */
  delaySec: number;
  /** At most this many errand runs a day. */
  perDay: number;
}

export interface Errand {
  items: { id: string; name: string; packs: number }[];
  /** What the supplies cost (0 for a free rescue). */
  cost: number;
  /** The friend's fee for the run (0 for a free rescue). */
  fee: number;
  /** You couldn't afford it, so it's on the house. */
  free: boolean;
}

/** Packs of each dough ingredient needed to bake `batches` batches with what's in stock. */
export function doughPacksFor(b: SuppliesBalance, recipe: Record<string, number>, stock: Stock, batches: number): Errand['items'] {
  const out: Errand['items'] = [];
  for (const [id, per] of Object.entries(recipe)) {
    const it = b.items.find((i) => i.id === id);
    const short = per * batches - (stock[id] ?? 0);
    if (it && short > 0) out.push({ id, name: it.name, packs: Math.ceil(short / it.pack) });
  }
  return out;
}

/**
 * A friend's run to the store when you're out of baking materials: if you can
 * pay for the supplies plus their fee, they fetch enough for a few batches;
 * if you can't, they bring enough for one batch, on the house. Null if
 * nothing's needed.
 */
export function errandFor(b: SuppliesBalance, eb: ErrandBalance, recipe: Record<string, number>, stock: Stock, cash: number, priceOf: (id: string) => number): Errand | null {
  const round = (n: number) => Math.round(n * 100) / 100;
  const items = doughPacksFor(b, recipe, stock, eb.batches);
  if (!items.length) return null;
  const cost = round(items.reduce((s, i) => s + i.packs * priceOf(i.id), 0));
  const fee = round(Math.max(eb.feeMin, cost * eb.feeRate));
  if (cash >= cost + fee) return { items, cost, fee, free: false };
  const rescue = doughPacksFor(b, recipe, stock, eb.rescueBatches);
  return rescue.length ? { items: rescue, cost: 0, fee: 0, free: true } : null;
}
