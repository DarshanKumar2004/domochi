import { describe, expect, it } from 'vitest';
import balanceJson from '../../src/data/balance.json';
import customersJson from '../../src/data/customers.json';
import menuJson from '../../src/data/menu.json';
import { TextureKeys } from '../../src/assets/keys';
import { forDay, validateBalance, type Balance } from '../../src/systems/balance';
import { fillTemplate, validateCustomers, type CustomersData } from '../../src/systems/customers';
import { flavorsForDay, type Menu } from '../../src/systems/menu';
import { boxFor, describeOrder, generateOrder, groupFlavors, orderSizeRange } from '../../src/systems/orders';
import { createRng } from '../../src/systems/rng';

const menu = menuJson as Menu;
const customers = customersJson as CustomersData;
const balance = balanceJson as Balance;

describe('rng', () => {
  it('is reproducible for a seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    expect(Array.from({ length: 5 }, () => a.next())).toEqual(Array.from({ length: 5 }, () => b.next()));
  });

  it('int stays in range, inclusive', () => {
    const r = createRng(1);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(r.int(2, 4));
    expect([...seen].sort()).toEqual([2, 3, 4]);
  });

  it('weighted favours heavier items', () => {
    const r = createRng(7);
    let heavy = 0;
    for (let i = 0; i < 2000; i++) if (r.weighted(['a', 'b'], (x) => (x === 'a' ? 3 : 1)) === 'a') heavy++;
    expect(heavy / 2000).toBeGreaterThan(0.7);
    expect(heavy / 2000).toBeLessThan(0.8);
  });
});

describe('data files', () => {
  it('balance.json is valid', () => {
    expect(validateBalance(balance)).toEqual([]);
  });

  it('customers.json is valid against the menu and texture keys', () => {
    expect(validateCustomers(customers, menu, Object.values(TextureKeys))).toEqual([]);
  });

  it('validateCustomers catches bad references and missing placeholders', () => {
    const t = customers.types[0]!;
    const errors = validateCustomers(
      {
        types: [
          { ...t, sprite: 'nope', favorites: ['pizza'], lines: { ...t.lines, order: ['hi'], notMine: ['no'] } },
        ],
        giftLines: ['yay'],
      },
      menu,
      Object.values(TextureKeys),
    ).join('\n');
    expect(errors).toContain('sprite "nope"');
    expect(errors).toContain('favorite "pizza"');
    expect(errors).toContain('missing {order}');
    expect(errors).toContain('missing {ticket}');
  });

  it('forDay clamps to the list', () => {
    expect(forDay([10, 20, 30], 1)).toBe(10);
    expect(forDay([10, 20, 30], 3)).toBe(30);
    expect(forDay([10, 20, 30], 99)).toBe(30);
    expect(forDay([10, 20, 30], 0)).toBe(10);
  });
});

describe('orders', () => {
  it('boxFor picks the smallest box that fits', () => {
    expect(boxFor(menu, 1).id).toBe('single');
    expect(boxFor(menu, 2).id).toBe('trio');
    expect(boxFor(menu, 3).id).toBe('trio');
    expect(boxFor(menu, 4).id).toBe('flight');
    expect(boxFor(menu, 12).id).toBe('domochi-box');
    expect(boxFor(menu, 20).id).toBe('domochi-box');
  });

  it('orderSizeRange narrows by customer type and is never empty', () => {
    expect(orderSizeRange({ min: 1, max: 3 }, { min: 2, max: 6 })).toEqual({ min: 2, max: 3 });
    expect(orderSizeRange({ min: 1, max: 2 }, { min: 4, max: 6 })).toEqual({ min: 2, max: 2 });
    expect(orderSizeRange({ min: 3, max: 6 }, { min: 1, max: 2 })).toEqual({ min: 2, max: 2 });
  });

  it('generates only unlocked flavors, in range, grouped, with the right box', () => {
    const rng = createRng(3);
    const unlocked = flavorsForDay(menu, 1).map((f) => f.id);
    for (let i = 0; i < 200; i++) {
      const o = generateOrder(menu, 1, { min: 1, max: 3 }, [], 3, rng);
      expect(o.flavors.length).toBeGreaterThanOrEqual(1);
      expect(o.flavors.length).toBeLessThanOrEqual(3);
      for (const f of o.flavors) expect(unlocked).toContain(f);
      // grouped: each flavor appears in one contiguous run
      expect(groupFlavors(o.flavors).flatMap((g) => Array(g.count).fill(g.flavorId))).toEqual(o.flavors);
      expect(o.boxId).toBe(boxFor(menu, o.flavors.length).id);
    }
  });

  it('describes orders like a person would', () => {
    expect(describeOrder(menu, { flavors: ['strawberry'], boxId: 'trio' })).toBe('a strawberry');
    expect(describeOrder(menu, { flavors: ['beignet', 'beignet'], boxId: 'trio' })).toBe('two beignet');
    expect(describeOrder(menu, { flavors: ['strawberry', 'cookies-and-cream', 'cookies-and-cream'], boxId: 'trio' })).toBe(
      'a strawberry and two cookies & cream',
    );
    expect(describeOrder(menu, { flavors: ['strawberry', 'beignet', 'fruity-cereal'], boxId: 'trio' })).toBe(
      'a strawberry, a beignet and a fruity cereal',
    );
  });

  it('fillTemplate replaces known placeholders and keeps unknown ones visible', () => {
    expect(fillTemplate('hi {order}! #{ticket} {oops}', { order: 'a beignet', ticket: 3 })).toBe('hi a beignet! #3 {oops}');
  });
});
