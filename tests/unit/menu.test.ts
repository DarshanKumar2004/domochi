import { describe, expect, it } from 'vitest';
import menuJson from '../../src/data/menu.json';
import { flavorsForDay, validateMenu, type Menu } from '../../src/systems/menu';

const menu = menuJson as Menu;

describe('src/data/menu.json', () => {
  it('is valid', () => {
    expect(validateMenu(menu)).toEqual([]);
  });

  it('has the real domochi flavors', () => {
    expect(menu.flavors.map((f) => f.name).sort()).toEqual(
      ['beignet', 'chocolate hazelnut', 'cookie butter', 'cookies & cream', 'fruity cereal', 'strawberry'].sort(),
    );
  });

  it('unlocks more flavors over the days', () => {
    expect(flavorsForDay(menu, 1).length).toBeGreaterThan(0);
    expect(flavorsForDay(menu, 99)).toHaveLength(menu.flavors.length);
  });
});

describe('validateMenu', () => {
  it('reports broken references and bad values', () => {
    const broken: Menu = {
      ...menu,
      glazes: [...menu.glazes, { id: 'x', name: 'x', style: 'splash' as never, color: 'pink' }],
      flavors: [
        { id: 'bad', name: 'bad', price: 0, description: '', glaze: 'nope', toppings: ['missing'], unlockDay: 0 },
      ],
    };
    const errors = validateMenu(broken).join('\n');
    expect(errors).toContain('unknown style "splash"');
    expect(errors).toContain('color "pink"');
    expect(errors).toContain('unknown glaze "nope"');
    expect(errors).toContain('unknown topping "missing"');
    expect(errors).toContain('unlockDay');
    expect(errors).toContain('price');
    expect(errors).toContain('no flavor is unlocked on day 1');
  });

  it('checks base glaze vs drizzle styles', () => {
    const base = menu.flavors[0]!;
    const errors = validateMenu({
      ...menu,
      flavors: [
        { ...base, id: 'a', glaze: 'white-icing', drizzle: undefined },
        { ...base, id: 'b', glaze: 'strawberry', drizzle: 'strawberry' },
        { ...base, id: 'c', glaze: 'strawberry', drizzle: 'nope' },
      ],
    }).join('\n');
    expect(errors).toContain('"a" base glaze "white-icing" must be a dip or dust');
    expect(errors).toContain('"b" drizzle "strawberry" is not a drizzle glaze');
    expect(errors).toContain('"c" uses unknown drizzle "nope"');
  });
});
