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

/** 'sprinkle': shaken on in many small pieces. 'piece': placed one at a time (a whole cookie). */
export type ToppingStyle = 'sprinkle' | 'piece';
/** How a piece is drawn. */
export type ToppingShape = 'crumb' | 'loop' | 'flake' | 'biscuit';

export interface Topping {
  id: string;
  name: string;
  colors: string[];
  style: ToppingStyle;
  shape: ToppingShape;
  /** Piece radius, normalised to the donut (edges ±1). */
  size: number;
  /** Pieces on the donut for full marks. */
  amount: { min: number; max: number };
}

export interface Flavor {
  id: string;
  name: string;
  price: number;
  description: string;
  /** Base coat: id of a 'dip' or 'dust' glaze. None: it skips the Glaze station (the beignet's sugar is a topping). */
  glaze?: string;
  /** Optional stripes over the base coat: id of a 'drizzle' glaze. */
  drizzle?: string;
  toppings: string[];
  /**
   * Where the drizzle goes (like the shop's photos): stripes as segments in
   * normalised donut coordinates. Without one, any even drizzle scores.
   */
  drizzlePattern?: Stripe[];
  /** First in-game day this flavor can be ordered. */
  unlockDay: number;
}

/** A straight stripe, normalised to the donut (centre 0,0, edges ±1). */
export interface Stripe {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
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
const TOPPING_STYLES: readonly string[] = ['sprinkle', 'piece'];
const SHAPES: readonly string[] = ['crumb', 'loop', 'flake', 'biscuit'];

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
    if (!TOPPING_STYLES.includes(t.style)) errors.push(`topping "${t.id}" has unknown style "${t.style}"`);
    if (!SHAPES.includes(t.shape)) errors.push(`topping "${t.id}" has unknown shape "${t.shape}"`);
    if (!(t.size > 0 && t.size < 1)) errors.push(`topping "${t.id}" size must be between 0 and 1`);
    if (!(t.amount && Number.isInteger(t.amount.min) && t.amount.min >= 1 && t.amount.max >= t.amount.min)) {
      errors.push(`topping "${t.id}" amount needs integer 1 <= min <= max`);
    }
  }
  for (const f of menu.flavors) {
    const base = f.glaze === undefined ? undefined : glazeById.get(f.glaze);
    if (f.glaze === undefined) {
      if (f.drizzle !== undefined) errors.push(`flavor "${f.id}" has a drizzle but no base glaze`);
      if (f.toppings.length === 0) errors.push(`flavor "${f.id}" needs a glaze or a topping`);
    } else if (!base) errors.push(`flavor "${f.id}" uses unknown glaze "${f.glaze}"`);
    else if (base.style === 'drizzle') {
      errors.push(`flavor "${f.id}" base glaze "${f.glaze}" must be a dip or dust, not a drizzle`);
    }
    if (f.drizzle !== undefined) {
      const d = glazeById.get(f.drizzle);
      if (!d) errors.push(`flavor "${f.id}" uses unknown drizzle "${f.drizzle}"`);
      else if (d.style !== 'drizzle') errors.push(`flavor "${f.id}" drizzle "${f.drizzle}" is not a drizzle glaze`);
    }
    for (const t of f.toppings) if (!toppingIds.has(t)) errors.push(`flavor "${f.id}" uses unknown topping "${t}"`);
    if (f.drizzlePattern !== undefined) {
      if (!f.drizzle) errors.push(`flavor "${f.id}" has a drizzlePattern but no drizzle`);
      const ok = (v: unknown) => typeof v === 'number' && v >= -1.2 && v <= 1.2;
      if (f.drizzlePattern.length === 0 || !f.drizzlePattern.every((s) => ok(s.x0) && ok(s.y0) && ok(s.x1) && ok(s.y1))) {
        errors.push(`flavor "${f.id}" drizzlePattern needs stripes with coordinates in [-1.2, 1.2]`);
      }
    }
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
