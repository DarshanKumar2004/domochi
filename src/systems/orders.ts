// Order generation and description. Pure: no Phaser, no clock, randomness injected.
import type { Range } from './balance';
import { flavorsForDay, type BoxSize, type Menu } from './menu';
import type { Rng } from './rng';

export interface Order {
  /** Flavor ids, grouped so equal flavors are adjacent (how a ticket lists them). */
  flavors: string[];
  /** Box the order is packed in. */
  boxId: string;
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
): Order {
  const available = flavorsForDay(menu, day);
  if (available.length === 0) throw new Error(`no flavors unlocked on day ${day}`);
  const n = rng.int(size.min, size.max);
  const picked: string[] = [];
  for (let i = 0; i < n; i++) {
    picked.push(rng.weighted(available, (f) => (favorites.includes(f.id) ? favoriteWeight : 1)).id);
  }
  const flavors = groupFlavors(picked).flatMap((g) => Array<string>(g.count).fill(g.flavorId));
  return { flavors, boxId: boxFor(menu, n).id };
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
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
