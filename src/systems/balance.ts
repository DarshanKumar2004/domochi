// Types and helpers for src/data/balance.json.
import type { FryBalance } from '../stations/fry';
import type { BoxBalance } from '../stations/box';
import type { GlazeBalance } from '../stations/glaze';
import type { ToppingsBalance } from '../stations/toppings';
import type { DoughBalance } from '../stations/dough';
import { validateScoring, type ScoringBalance } from './score';
import type { GuideItem, PaymentBalance, SuppliesBalance } from './supplies';
import type { WeatherBalance } from './weather';

export interface Range {
  min: number;
  max: number;
}

export interface Balance {
  customersPerDay: number[];
  /** By day: most customers in line or waiting at once. */
  maxActiveByDay: number[];
  /** After serving someone, the next customer arrives this long later (random in range). */
  afterServeSec: Range;
  spawn: {
    firstDelaySec: number;
    intervalSec: Range;
    maxInLine: number;
  };
  orderSizeByDay: Range[];
  favoriteWeight: number;
  fry: FryBalance;
  glaze: GlazeBalance;
  toppings: ToppingsBalance;
  box: BoxBalance;
  scoring: ScoringBalance;
  dough: DoughBalance;
  deliveries: { byDay: number[]; size: Range };
  events: { inviteChance: Record<'great' | 'good' | 'okay' | 'bad', number>; giftBonus: number; fromDay?: number };
  cleanup: { messDoneAt: number; tidyBonus: number; oilDirtMax: number; wipePerUnit: number };
  /** A day at the window lasts this long once you open. */
  day: { lengthSec: number };
  payment: PaymentBalance;
  supplies: SuppliesBalance;
  guides: { items: GuideItem[] };
  weather: WeatherBalance;
  regulars: { chance: number; usualAt: number; maxLevel: number };
  special: { priceBonus: number; fromDay?: number };
  goals: { reward: number; fromDay: number; list: { id: string; text: string; base: number; perDay: number; max: number }[] };
  streak: { tipPerOrder: number; maxBonus: number };
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
  if (b.maxActiveByDay.length === 0) errors.push('maxActiveByDay is empty');
  for (const n of b.maxActiveByDay) if (!(Number.isInteger(n) && n >= 1)) errors.push(`maxActiveByDay entry ${n} must be an integer >= 1`);
  if (badRange(b.afterServeSec, 0)) errors.push('afterServeSec needs 0 <= min <= max');
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
  if (!(Number.isInteger(f.slots) && f.slots >= 1 && f.rackCapacity >= 1)) errors.push('fry needs slots >= 1 and rackCapacity >= 1');
  if (!(f.burntAt > 1 + f.doneness.zeroAt)) errors.push('fry.burntAt must be past the point where a side scores 0');
  if (!(f.oilDriftF >= 0)) errors.push('fry.oilDriftF must be >= 0');
  const g = b.glaze;
  if (!(Number.isInteger(g.gridSize) && g.gridSize >= 16)) errors.push('glaze.gridSize must be an integer >= 16');
  for (const s of ['dip', 'dust', 'drizzle'] as const) if (!(g.brushRadius[s] > 0)) errors.push(`glaze.brushRadius.${s} must be > 0`);
  for (const s of ['dip', 'dust'] as const) {
    if (!(g.goodCoverage[s] > 0 && g.goodCoverage[s] <= 1)) errors.push(`glaze.goodCoverage.${s} must be in (0, 1]`);
  }
  const da = g.drizzleAmount;
  if (!(da.idealMin > 0 && da.idealMin <= da.idealMax && da.idealMax < da.zeroAt && da.zeroAt <= 1)) {
    errors.push('glaze.drizzleAmount needs 0 < idealMin <= idealMax < zeroAt <= 1');
  }
  if (!(g.drizzleWeight >= 0 && g.drizzleWeight <= 1)) errors.push('glaze.drizzleWeight must be in [0, 1]');
  if (!(g.fallMs >= 0 && Number.isInteger(g.shelfCapacity) && g.shelfCapacity >= 1)) errors.push('glaze needs fallMs >= 0 and shelfCapacity >= 1');
  if (!(g.spillZeroAt > 0 && g.wrongGlazeFactor >= 0 && g.wrongGlazeFactor < 1)) errors.push('glaze needs spillZeroAt > 0 and 0 <= wrongGlazeFactor < 1');
  if (!(g.ringRadius > 0 && g.ringRadius < 1)) errors.push('glaze.ringRadius must be between 0 and 1');
  if (!(g.patternGoodCoverage > 0 && g.patternGoodCoverage <= 1 && g.patternSpillZeroAt > 0)) {
    errors.push('glaze needs patternGoodCoverage in (0, 1] and patternSpillZeroAt > 0');
  }
  const t = b.toppings;
  if (!(t.sprinkleEveryMs > 0 && t.scatter >= 0 && t.fallMs >= 0 && Number.isInteger(t.maxPieces) && t.maxPieces >= 1)) {
    errors.push('toppings needs sprinkleEveryMs > 0, scatter >= 0, fallMs >= 0 and integer maxPieces >= 1');
  }
  if (!(t.tooMuchZeroAtFactor > 1)) errors.push('toppings.tooMuchZeroAtFactor must be > 1');
  if (!(t.evennessFloor >= 0 && t.evennessFloor <= 1 && t.messZeroAt > 0 && t.unwantedFactor >= 0 && t.unwantedFactor < 1)) {
    errors.push('toppings needs evennessFloor in [0, 1], messZeroAt > 0 and 0 <= unwantedFactor < 1');
  }
  if (!(b.box.wrongSpotCredit >= 0 && b.box.wrongSpotCredit <= 1 && b.box.extraPenalty >= 0)) {
    errors.push('box needs wrongSpotCredit in [0, 1] and extraPenalty >= 0');
  }
  errors.push(...validateScoring(b.scoring));
  const d = b.dough;
  if (!(Number.isInteger(d.batchSize) && d.batchSize >= 1 && d.tubCapacity >= d.batchSize && d.stirTurns > 0)) {
    errors.push('dough needs integer batchSize >= 1, tubCapacity >= batchSize and stirTurns > 0');
  }
  for (const id of Object.keys(d.recipe)) if (!d.ingredients.some((i) => i.id === id)) errors.push(`dough.recipe uses unknown ingredient "${id}"`);
  if (b.deliveries.byDay.length === 0 || badRange(b.deliveries.size, 1)) errors.push('deliveries needs byDay and a size range >= 1');
  if (!(b.cleanup.messDoneAt >= 0 && b.cleanup.tidyBonus >= 0 && b.cleanup.oilDirtMax > 0 && b.cleanup.wipePerUnit > 0)) {
    errors.push('cleanup numbers must be >= 0 (oilDirtMax, wipePerUnit > 0)');
  }
  if (!(f.oil.minToFry > 0 && f.oil.minToFry < f.oil.lowThreshold && f.oil.lowThreshold < 1)) errors.push('fry.oil needs 0 < minToFry < lowThreshold < 1');
  return errors;
}
