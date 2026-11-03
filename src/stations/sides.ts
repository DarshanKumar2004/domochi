// Kolaches and onigiri: the menu types they share, and small scoring helpers.
// Pure: no Phaser. Content is in menu.json ("sides"), numbers in balance.json
// ("bake", "rice", "sides").

export type SideKind = 'kolache' | 'onigiri';
export const SIDE_KINDS: readonly SideKind[] = ['kolache', 'onigiri'];

/** 'wrap': folded round the filling and pinched shut (savory). 'well': a pressed well filled on top (sweet). */
export type FillingStyle = 'wrap' | 'well';

export interface SideFilling {
  id: string;
  name: string;
  /** CSS hex colour (what shows through). */
  color: string;
  /** A second colour for flecks (jalapeno in the sausage, maple on the bacon). */
  accent?: string;
  /** Kolaches only: how it goes in. */
  style?: FillingStyle;
}

/** A finishing touch shaken or placed on top (a crumble, seeds, furikake…; none on the menu yet). */
export interface SideTopping {
  id: string;
  name: string;
  colors: string[];
  /** Taps (pieces) for full marks. */
  amount: { min: number; max: number };
}

export interface SideItem {
  id: string;
  name: string;
  price: number;
  description: string;
  filling: string;
  /** Toppings it gets (ids from the same kind's toppings). */
  toppings: string[];
  unlockDay: number;
}

export interface SideBox {
  id: string;
  name: string;
  size: number;
}

export interface SideMenu {
  fillings: SideFilling[];
  toppings: SideTopping[];
  items: SideItem[];
  /** Smallest that fits is used. */
  boxes: SideBox[];
}

export type SidesMenu = Record<SideKind, SideMenu>;

/** How many of each side an order can have, and how often it gets one. */
export interface SidesBalance {
  kolache: { chance: number; count: { min: number; max: number } };
  onigiri: { chance: number; count: { min: number; max: number } };
  /** Pickup (courier) orders get sides this much less often (× chance). */
  pickupFactor: number;
  /** A kind that went out in a napkin (out of its box) scores × this. */
  napkinFactor?: number;
}

/** 1 inside [min, max], falling in a straight line to 0 at `zeroAt` beyond either end. */
export function rangeScore(v: number, ideal: { min: number; max: number }, zeroAt: number): number {
  if (v >= ideal.min - 1e-9 && v <= ideal.max + 1e-9) return 1;
  const off = v < ideal.min ? ideal.min - v : v - ideal.max;
  return Math.max(0, 1 - off / zeroAt);
}

/** Items of a kind on the menu by a given day. */
export function sideItemsForDay(m: SideMenu | undefined, day: number): SideItem[] {
  return m ? m.items.filter((i) => i.unlockDay <= day) : [];
}

/** Smallest box that fits `n` (the largest if none do). */
export function sideBoxFor(m: SideMenu, n: number): SideBox {
  const sorted = [...m.boxes].sort((a, b) => a.size - b.size);
  return sorted.find((b) => b.size >= n) ?? sorted[sorted.length - 1]!;
}

/** Score of each wanted topping's count, × unwantedFactor per topping that shouldn't be there. */
export function sideToppingScore(item: SideItem, counts: Readonly<Record<string, number>>, m: SideMenu, unwantedFactor: number): number {
  let s = 1;
  for (const id of item.toppings) {
    const t = m.toppings.find((x) => x.id === id);
    if (!t) continue;
    const n = counts[id] ?? 0;
    s *= n === 0 ? 0.3 : rangeScore(n, t.amount, Math.max(2, t.amount.max));
  }
  for (const [id, n] of Object.entries(counts)) if (n > 0 && !item.toppings.includes(id)) s *= unwantedFactor;
  return s;
}

/** The item this filling and these toppings make exactly (or the one with this filling if none match exactly). */
export function identifySide(m: SideMenu, filling: string | null, counts: Readonly<Record<string, number>>): SideItem | null {
  if (!filling) return null;
  const on = Object.keys(counts).filter((k) => (counts[k] ?? 0) > 0).sort();
  const same = m.items.filter((i) => i.filling === filling);
  return same.find((i) => [...i.toppings].sort().join() === on.join()) ?? same[0] ?? null;
}

/**
 * Match packed items to the ordered ones, best score first (each packed item
 * is used once). Returns, for each ordered item, the packed index or -1.
 */
export function matchSides<T>(wanted: readonly string[], packed: readonly T[], score: (p: T, itemId: string) => number): number[] {
  const out = wanted.map(() => -1);
  const pairs: { w: number; p: number; s: number }[] = [];
  wanted.forEach((id, w) => packed.forEach((p, i) => pairs.push({ w, p: i, s: score(p, id) })));
  pairs.sort((a, b) => b.s - a.s);
  const used = new Set<number>();
  for (const pr of pairs) {
    if (out[pr.w]! >= 0 || used.has(pr.p)) continue;
    out[pr.w] = pr.p;
    used.add(pr.p);
  }
  return out;
}

/** Problems with the sides menu (empty: fine). */
export function validateSides(s: SidesMenu): string[] {
  const errors: string[] = [];
  const HEX = /^#[0-9a-f]{6}$/i;
  for (const kind of SIDE_KINDS) {
    const m = s[kind];
    if (!m) {
      errors.push(`sides.${kind} is missing`);
      continue;
    }
    const fillings = new Set(m.fillings.map((f) => f.id));
    const toppings = new Set(m.toppings.map((t) => t.id));
    const ids = m.items.map((i) => i.id);
    for (const id of ids.filter((x, i) => ids.indexOf(x) !== i)) errors.push(`duplicate ${kind} id "${id}"`);
    for (const f of m.fillings) {
      if (!HEX.test(f.color) || (f.accent && !HEX.test(f.accent))) errors.push(`${kind} filling "${f.id}" colours must be #rrggbb`);
      if (kind === 'kolache' && f.style !== 'wrap' && f.style !== 'well') errors.push(`kolache filling "${f.id}" needs style wrap or well`);
    }
    for (const t of m.toppings) {
      if (!t.colors.length || !t.colors.every((c) => HEX.test(c))) errors.push(`${kind} topping "${t.id}" colours must be #rrggbb`);
      if (!(Number.isInteger(t.amount.min) && t.amount.min >= 1 && t.amount.max >= t.amount.min)) errors.push(`${kind} topping "${t.id}" amount needs 1 <= min <= max`);
    }
    for (const i of m.items) {
      if (!fillings.has(i.filling)) errors.push(`${kind} "${i.id}" uses unknown filling "${i.filling}"`);
      for (const t of i.toppings) if (!toppings.has(t)) errors.push(`${kind} "${i.id}" uses unknown topping "${t}"`);
      if (!(i.price > 0)) errors.push(`${kind} "${i.id}" price must be > 0`);
      if (!Number.isInteger(i.unlockDay) || i.unlockDay < 1) errors.push(`${kind} "${i.id}" unlockDay must be an integer >= 1`);
    }
    if (!m.boxes.length || !m.boxes.every((b) => Number.isInteger(b.size) && b.size >= 1)) errors.push(`sides.${kind} needs boxes with integer sizes >= 1`);
  }
  return errors;
}
