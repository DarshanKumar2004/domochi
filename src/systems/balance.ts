// Types and helpers for src/data/balance.json.

export interface Range {
  min: number;
  max: number;
}

export interface Balance {
  customersPerDay: number[];
  spawn: {
    firstDelaySec: number;
    intervalSec: Range;
    maxInLine: number;
  };
  orderSizeByDay: Range[];
  favoriteWeight: number;
}

/** Entry for `day` (1-based) in a by-day list; days past the end reuse the last entry. */
export function forDay<T>(list: readonly T[], day: number): T {
  if (list.length === 0) throw new Error('by-day list is empty');
  const i = Math.min(Math.max(Math.floor(day), 1), list.length) - 1;
  return list[i]!;
}

function badRange(r: Range, min: number): boolean {
  return !(r.min >= min && r.max >= r.min);
}

export function validateBalance(b: Balance): string[] {
  const errors: string[] = [];
  if (b.customersPerDay.length === 0) errors.push('customersPerDay is empty');
  for (const n of b.customersPerDay) if (!(Number.isInteger(n) && n >= 1)) errors.push(`customersPerDay entry ${n} must be an integer >= 1`);
  if (!(b.spawn.firstDelaySec >= 0)) errors.push('spawn.firstDelaySec must be >= 0');
  if (badRange(b.spawn.intervalSec, 0.1)) errors.push('spawn.intervalSec must have 0.1 <= min <= max');
  if (!(Number.isInteger(b.spawn.maxInLine) && b.spawn.maxInLine >= 1)) errors.push('spawn.maxInLine must be an integer >= 1');
  if (b.orderSizeByDay.length === 0) errors.push('orderSizeByDay is empty');
  for (const r of b.orderSizeByDay) if (badRange(r, 1)) errors.push(`orderSizeByDay ${JSON.stringify(r)} needs 1 <= min <= max`);
  if (!(b.favoriteWeight >= 1)) errors.push('favoriteWeight must be >= 1');
  return errors;
}
