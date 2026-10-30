// Menu types and validation. Content lives in src/data/menu.json so the real
// domochi menu can change without code changes.

export type GlazeStyle = 'dip' | 'drizzle' | 'dust';

export interface Glaze {
  id: string;
  name: string;
  style: GlazeStyle;
  /** CSS hex color used to draw it. */
  color: string;
  /** Optional detail flecks poured with the glaze (strawberry seeds, cookie crumbs…). */
  speckles?: { colors: string[]; density: number };
}

export interface Topping {
  id: string;
  name: string;
  colors: string[];
}

export interface Flavor {
  id: string;
  name: string;
  price: number;
  description: string;
  /** Base coat: id of a 'dip' or 'dust' glaze. */
  glaze: string;
  /** Optional stripes over the base coat: id of a 'drizzle' glaze. */
  drizzle?: string;
  toppings: string[];
  /** First in-game day this flavor can be ordered. */
  unlockDay: number;
}

export interface BoxSize {
  id: string;
  name: string;
  size: number;
  price: number;
  description: string;
}

export interface Menu {
  currency: string;
  glazes: Glaze[];
  toppings: Topping[];
  flavors: Flavor[];
  boxes: BoxSize[];
}

const HEX = /^#[0-9a-f]{6}$/i;
const STYLES: readonly string[] = ['dip', 'drizzle', 'dust'];

function duplicates(ids: string[]): string[] {
  return ids.filter((id, i) => ids.indexOf(id) !== i);
}

/** Returns human-readable problems with a menu; empty means valid. */
export function validateMenu(menu: Menu): string[] {
  const errors: string[] = [];
  const glazeById = new Map(menu.glazes.map((g) => [g.id, g]));
  const toppingIds = new Set(menu.toppings.map((t) => t.id));

  for (const [kind, ids] of [
    ['glaze', menu.glazes.map((g) => g.id)],
    ['topping', menu.toppings.map((t) => t.id)],
    ['flavor', menu.flavors.map((f) => f.id)],
    ['box', menu.boxes.map((b) => b.id)],
  ] as const) {
    for (const d of duplicates([...ids])) errors.push(`duplicate ${kind} id "${d}"`);
  }

  for (const g of menu.glazes) {
    if (!STYLES.includes(g.style)) errors.push(`glaze "${g.id}" has unknown style "${g.style}"`);
    if (!HEX.test(g.color)) errors.push(`glaze "${g.id}" color "${g.color}" is not #rrggbb`);
    if (g.speckles) {
      if (!(g.speckles.density >= 0 && g.speckles.density <= 1)) errors.push(`glaze "${g.id}" speckle density must be 0–1`);
      for (const c of g.speckles.colors) if (!HEX.test(c)) errors.push(`glaze "${g.id}" speckle color "${c}" is not #rrggbb`);
    }
  }
  for (const t of menu.toppings) {
    if (t.colors.length === 0) errors.push(`topping "${t.id}" has no colors`);
    for (const c of t.colors) if (!HEX.test(c)) errors.push(`topping "${t.id}" color "${c}" is not #rrggbb`);
  }
  for (const f of menu.flavors) {
    const base = glazeById.get(f.glaze);
    if (!base) errors.push(`flavor "${f.id}" uses unknown glaze "${f.glaze}"`);
    else if (base.style === 'drizzle') {
      errors.push(`flavor "${f.id}" base glaze "${f.glaze}" must be a dip or dust, not a drizzle`);
    }
    if (f.drizzle !== undefined) {
      const d = glazeById.get(f.drizzle);
      if (!d) errors.push(`flavor "${f.id}" uses unknown drizzle "${f.drizzle}"`);
      else if (d.style !== 'drizzle') errors.push(`flavor "${f.id}" drizzle "${f.drizzle}" is not a drizzle glaze`);
    }
    for (const t of f.toppings) if (!toppingIds.has(t)) errors.push(`flavor "${f.id}" uses unknown topping "${t}"`);
    if (!Number.isInteger(f.unlockDay) || f.unlockDay < 1) errors.push(`flavor "${f.id}" unlockDay must be an integer >= 1`);
    if (!(f.price > 0)) errors.push(`flavor "${f.id}" price must be > 0`);
  }
  for (const b of menu.boxes) {
    if (!Number.isInteger(b.size) || b.size < 1) errors.push(`box "${b.id}" size must be an integer >= 1`);
  }
  if (!menu.flavors.some((f) => f.unlockDay === 1)) errors.push('no flavor is unlocked on day 1');
  return errors;
}

/** Flavors orderable on a given day. */
export function flavorsForDay(menu: Menu, day: number): Flavor[] {
  return menu.flavors.filter((f) => f.unlockDay <= day);
}
