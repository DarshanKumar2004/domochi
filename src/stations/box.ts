// Box station logic. Pure: no Phaser.
//
// The player puts finished donuts into the box's slots in the ticket's order
// (the ticket lists flavours grouped, top to bottom), then closes the lid.
// The box score is about putting the right donuts in the right places; how
// well each donut was fried, glazed and topped is scored separately against
// the flavour it's matched to (matchDonuts).

import type { Menu } from '../systems/menu';
import type { FinishedDonut } from './toppings';
import { toppingsOn } from './toppings';

export interface BoxBalance {
  /** Credit for an ordered flavour that's in the box but in the wrong slot. */
  wrongSpotCredit: number;
  /** Taken off (as a share of the whole score) per donut beyond the order. */
  extraPenalty: number;
}

/** Which menu flavour a donut is (base glaze, drizzle and toppings all match), or null. */
export function identifyFlavor(d: FinishedDonut, menu: Menu): string | null {
  const base = d.layers.find((l) => l.kind === 'base')?.glazeId;
  const drizzle = d.layers.find((l) => l.kind === 'drizzle')?.glazeId;
  const tops = toppingsOn(d);
  for (const f of menu.flavors) {
    if (f.glaze !== base || f.drizzle !== drizzle) continue;
    if (f.toppings.length !== tops.size || !f.toppings.every((t) => tops.has(t))) continue;
    return f.id;
  }
  return null;
}

export interface BoxResult {
  /** 0–100. */
  score: number;
  /** Ordered slots holding the right flavour. */
  correct: number;
  /** Ordered flavours in the box but in the wrong slot. */
  misplaced: number;
  /** Ordered slots left empty. */
  empty: number;
  /** Donuts beyond the order that aren't a real flavour (mistakes). */
  extras: number;
  /** Real-flavour donuts beyond the order: gifts for the customer. */
  gifts: number;
}

/**
 * Score a packed box. `expected[i]` is the flavour wanted in slot i; `packed[i]`
 * is the flavour that's there (identified, or null if it matches nothing, or
 * undefined if the slot is empty). Slots past expected.length are gifts (a real
 * flavour) or extras (a donut that isn't any flavour, which costs points).
 */
export function scoreBox(expected: readonly string[], packed: readonly (string | null | undefined)[], b: BoxBalance): BoxResult {
  const n = expected.length;
  let correct = 0;
  let empty = 0;
  let extras = 0;
  let gifts = 0;
  // Ordered flavours not yet accounted for, and donuts in ordered slots that are in the wrong spot.
  const missing = new Map<string, number>();
  const strays: string[] = [];
  for (let i = 0; i < Math.max(n, packed.length); i++) {
    const want = expected[i];
    const got = packed[i];
    if (want === undefined) {
      if (got === null) extras++;
      else if (got !== undefined) gifts++;
      continue;
    }
    if (got === want) {
      correct++;
      continue;
    }
    missing.set(want, (missing.get(want) ?? 0) + 1);
    if (got === undefined) empty++;
    else if (got !== null) strays.push(got);
  }
  let misplaced = 0;
  for (const s of strays) {
    const left = missing.get(s) ?? 0;
    if (left > 0) {
      missing.set(s, left - 1);
      misplaced++;
    }
  }
  const raw = n ? (correct + misplaced * b.wrongSpotCredit) / n - extras * b.extraPenalty : 0;
  return { score: Math.round(clamp01(raw) * 100), correct, misplaced, empty, extras, gifts };
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/**
 * Pair each ordered flavour with a boxed donut, to score how well it was made.
 * A donut in its right slot is paired with that slot; the rest are paired
 * greedily by `quality` (best first). Returns, per ordered slot, the index into
 * `donuts` (-1 if nothing was left to pair).
 */
export function matchDonuts(
  expected: readonly string[],
  donuts: readonly (FinishedDonut | undefined)[],
  identified: readonly (string | null | undefined)[],
  quality: (d: FinishedDonut, flavorId: string) => number,
): number[] {
  const match = new Array<number>(expected.length).fill(-1);
  const used = new Set<number>();
  expected.forEach((want, i) => {
    if (donuts[i] && identified[i] === want) {
      match[i] = i;
      used.add(i);
    }
  });
  expected.forEach((want, i) => {
    if (match[i] !== -1) return;
    let best = -1;
    let bestQ = -1;
    donuts.forEach((d, j) => {
      if (!d || used.has(j)) return;
      const q = quality(d, want);
      if (q > bestQ) {
        bestQ = q;
        best = j;
      }
    });
    if (best >= 0) {
      match[i] = best;
      used.add(best);
    }
  });
  return match;
}

/** A short word for a box score (0–100). */
export function boxVerdict(score: number): string {
  if (score >= 100) return 'boxed just right!';
  if (score >= 70) return 'nearly right';
  if (score >= 40) return 'a few mix-ups';
  return "that's not what they ordered";
}
