// Order generation and description. Pure: no Phaser, no clock, randomness injected.
import type { Range } from './balance';
import { flavorsForDay, type BoxSize, type Menu } from './menu';
import type { Rng } from './rng';
import { SIDE_KINDS, sideItemsForDay, type SideKind, type SidesBalance } from '../stations/sides';

export interface Order {
  /** Flavor ids, grouped so equal flavors are adjacent (how a ticket lists them). */
  flavors: string[];
  /** Box the order is packed in. */
  boxId: string;
  /** Kolache item ids (menu.sides.kolache), grouped like flavors. They go in their own box. */
  kolaches?: string[];
  /** Onigiri item ids (menu.sides.onigiri), grouped. Their own box too. */
  onigiri?: string[];
}

/** The kolaches or onigiri in an order (empty if none). */
export function sidesOf(order: Order, kind: SideKind): readonly string[] {
  return (kind === 'kolache' ? order.kolaches : order.onigiri) ?? [];
}

/** Every item in the order: donuts plus kolaches plus onigiri. */
export function itemCount(order: Order): number {
  return order.flavors.length + sidesOf(order, 'kolache').length + sidesOf(order, 'onigiri').length;
}

/** "maple bacon kolaches", "tuna onigiri" (onigiri doesn't take an s). */
export function sidePlural(kind: SideKind, name: string): string {
  return kind === 'kolache' ? `${name}s` : name;
}

/** The menu entry (name, price…) of a kolache or onigiri. */
export function sideItem(menu: Menu, kind: SideKind, id: string) {
  return menu.sides?.[kind].items.find((i) => i.id === id);
}

export interface FlavorCount {
  flavorId: string;
  count: number;
}

/** Smallest box that fits `count` donuts (the largest box if none do). */
export function boxFor(menu: Menu, count: number): BoxSize {
  const sorted = [...menu.boxes].sort((a, b) => a.size - b.size);
  if (sorted.length === 0) throw new Error('menu has no boxes');
  return sorted.find((b) => b.size >= count) ?? sorted[sorted.length - 1]!;
}

/** The day's order-size range narrowed by the customer type's preference (never empty). */
export function orderSizeRange(day: Range, type: Range): Range {
  const max = Math.max(1, Math.min(day.max, type.max));
  const min = Math.min(Math.max(day.min, type.min), max);
  return { min, max };
}

/**
 * What the order sells for: the box's price when it's full (the trio, the
 * flight, the domochi box), otherwise each donut at its own price.
 */
export function orderPrice(menu: Menu, order: Order): number {
  const box = menu.boxes.find((b) => b.id === order.boxId);
  if (box && box.size === order.flavors.length) return Math.round((box.price + sidesPrice(menu, order)) * 100) / 100;
  let sum = 0;
  for (const id of order.flavors) sum += menu.flavors.find((f) => f.id === id)?.price ?? 0;
  return Math.round((sum + sidesPrice(menu, order)) * 100) / 100;
}

/** Kolaches and onigiri are priced one by one (their boxes are free). */
export function sidesPrice(menu: Menu, order: Order): number {
  let sum = 0;
  for (const kind of SIDE_KINDS) for (const id of sidesOf(order, kind)) sum += sideItem(menu, kind, id)?.price ?? 0;
  return sum;
}

/** Flavor counts in first-appearance order. */
export function groupFlavors(flavors: readonly string[]): FlavorCount[] {
  const groups: FlavorCount[] = [];
  for (const id of flavors) {
    const g = groups.find((x) => x.flavorId === id);
    if (g) g.count++;
    else groups.push({ flavorId: id, count: 1 });
  }
  return groups;
}

export function generateOrder(
  menu: Menu,
  day: number,
  size: Range,
  favorites: readonly string[],
  favoriteWeight: number,
  rng: Rng,
  /** Kolaches and onigiri on the menu ride along now and then (factor × their chance). */
  sides?: { balance: SidesBalance; factor?: number },
): Order {
  const available = flavorsForDay(menu, day);
  if (available.length === 0) throw new Error(`no flavors unlocked on day ${day}`);
  const n = rng.int(size.min, size.max);
  const picked: string[] = [];
  for (let i = 0; i < n; i++) {
    picked.push(rng.weighted(available, (f) => (favorites.includes(f.id) ? favoriteWeight : 1)).id);
  }
  const flavors = groupFlavors(picked).flatMap((g) => Array<string>(g.count).fill(g.flavorId));
  const order: Order = { flavors, boxId: boxFor(menu, n).id };
  if (sides && menu.sides) {
    for (const kind of SIDE_KINDS) {
      const items = sideItemsForDay(menu.sides[kind], day);
      const sb = sides.balance[kind];
      if (!items.length || !(rng.next() < sb.chance * (sides.factor ?? 1))) continue;
      const k = rng.int(sb.count.min, sb.count.max);
      const pickedSides: string[] = [];
      for (let i = 0; i < k; i++) pickedSides.push(rng.pick(items).id);
      const grouped = groupFlavors(pickedSides).flatMap((g) => Array<string>(g.count).fill(g.flavorId));
      if (kind === 'kolache') order.kolaches = grouped;
      else order.onigiri = grouped;
    }
  }
  return order;
}

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

function numberWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

function article(word: string): string {
  return /^[aeiou]/i.test(word) ? 'an' : 'a';
}

/** Spoken form of an order: "a strawberry and two cookies & cream". */
export function describeOrder(menu: Menu, order: Order): string {
  const parts = groupFlavors(order.flavors).map(({ flavorId, count }) => {
    const name = menu.flavors.find((f) => f.id === flavorId)?.name ?? flavorId;
    return count === 1 ? `${article(name)} ${name}` : `${numberWord(count)} ${name}`;
  });
  for (const kind of SIDE_KINDS) {
    for (const { flavorId, count } of groupFlavors(sidesOf(order, kind))) {
      const name = sideItem(menu, kind, flavorId)?.name ?? flavorId;
      // "two maple bacon kolaches", "two tuna onigiri" (onigiri doesn't take an s).
      parts.push(count === 1 ? `${article(name)} ${name}` : `${numberWord(count)} ${sidePlural(kind, name)}`);
    }
  }
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
