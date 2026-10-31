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
