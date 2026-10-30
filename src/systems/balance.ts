// Types and helpers for src/data/balance.json.
import type { FryBalance } from '../stations/fry';

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
  fry: FryBalance;
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

  const f = b.fry;
  if (!(f.dial.minF < f.dial.maxF)) errors.push('fry.dial needs minF < maxF');
  if (!(f.idealRangeF.min >= f.dial.minF && f.idealRangeF.max <= f.dial.maxF && f.idealRangeF.min < f.idealRangeF.max)) {
    errors.push('fry.idealRangeF must sit inside the dial range');
  }
  if (!(f.cookRate.zeroAtF < f.cookRate.oneAtF && f.cookRate.max >= 1)) errors.push('fry.cookRate needs zeroAtF < oneAtF and max >= 1');
  if (!(f.secondsPerSide > 0 && f.heatLagPerSec > 0)) errors.push('fry.secondsPerSide and heatLagPerSec must be > 0');
  if (!(f.topFactorFloating >= 0 && f.topFactorFloating < f.topFactorGrate && f.topFactorGrate <= 1)) {
    errors.push('fry needs 0 <= topFactorFloating < topFactorGrate <= 1');
  }
  if (!(f.doneness.perfectWithin < f.doneness.zeroAt)) errors.push('fry.doneness needs perfectWithin < zeroAt');
  if (!(f.oil.minToFry > 0 && f.oil.minToFry < f.oil.lowThreshold && f.oil.lowThreshold < 1)) errors.push('fry.oil needs 0 < minToFry < lowThreshold < 1');
  return errors;
}
