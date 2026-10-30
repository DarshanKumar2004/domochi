// Types, validation and dialogue helpers for src/data/customers.json.
import type { Range } from './balance';
import type { Menu } from './menu';
import type { Rng } from './rng';

export type ThanksTier = 'great' | 'good' | 'okay' | 'bad';

export interface CustomerLines {
  order: string[];
  notMine: string[];
  thanks: Record<ThanksTier, string[]>;
}

export interface CustomerType {
  id: string;
  name: string;
  /** Texture key for this customer's sprite. */
  sprite: string;
  favorites: string[];
  orderSize: Range;
  patienceSec: number;
  lines: CustomerLines;
}

export interface CustomersData {
  types: CustomerType[];
}

/** Replace {name} placeholders. Unknown placeholders are left as-is so typos are visible. */
export function fillTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in vars ? String(vars[key]) : whole));
}

export function pickLine(lines: readonly string[], rng: Rng, vars: Record<string, string | number> = {}): string {
  return fillTemplate(rng.pick(lines), vars);
}

const TIERS: readonly ThanksTier[] = ['great', 'good', 'okay', 'bad'];

export function validateCustomers(data: CustomersData, menu: Menu, textureKeys: readonly string[]): string[] {
  const errors: string[] = [];
  const flavorIds = new Set(menu.flavors.map((f) => f.id));
  const seen = new Set<string>();
  if (data.types.length === 0) errors.push('no customer types');

  for (const t of data.types) {
    if (seen.has(t.id)) errors.push(`duplicate customer type "${t.id}"`);
    seen.add(t.id);
    if (!textureKeys.includes(t.sprite)) errors.push(`customer "${t.id}" sprite "${t.sprite}" is not a texture key`);
    for (const f of t.favorites) if (!flavorIds.has(f)) errors.push(`customer "${t.id}" favorite "${f}" is not a menu flavor`);
    if (!(t.orderSize.min >= 1 && t.orderSize.max >= t.orderSize.min)) errors.push(`customer "${t.id}" orderSize needs 1 <= min <= max`);
    if (!(t.patienceSec > 0)) errors.push(`customer "${t.id}" patienceSec must be > 0`);

    if (t.lines.order.length === 0) errors.push(`customer "${t.id}" has no order lines`);
    for (const l of t.lines.order) if (!l.includes('{order}')) errors.push(`customer "${t.id}" order line is missing {order}: "${l}"`);
    if (t.lines.notMine.length === 0) errors.push(`customer "${t.id}" has no notMine lines`);
    for (const l of t.lines.notMine) if (!l.includes('{ticket}')) errors.push(`customer "${t.id}" notMine line is missing {ticket}: "${l}"`);
    for (const tier of TIERS) {
      if (!(t.lines.thanks[tier]?.length > 0)) errors.push(`customer "${t.id}" has no "${tier}" thanks lines`);
    }
  }
  return errors;
}
