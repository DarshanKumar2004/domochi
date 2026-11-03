// Order scoring, wait time, tips and the customer's reaction. Pure: no Phaser.
// All the numbers live in balance.json ("scoring").
import type { ThanksTier } from './customers';

export interface ScoringBalance {
  /** Weights of each station's score and the wait score (they needn't sum to 1). */
  weights: { fry: number; glaze: number; toppings: number; box: number; wait: number };
  /** Wait score: full marks until patience × graceShare, easing to 0 at patience × zeroShare. */
  wait: { graceShare: number; zeroShare: number };
  /** Lowest order score for each reaction tier (below `okay` is `bad`). */
  tiers: { great: number; good: number; okay: number };
  /** Tip = perDonut × donuts × curve(order score). Curve: [score, multiplier] points, straight lines between. */
  tip: { perDonut: number; curve: number[][] };
  /** Extra donuts as gifts: tip per gift (up to max), and the reaction goes up tierBoost levels. */
  gift: { tipPerDonut: number; max: number; tierBoost: number };
}

export interface StationScores {
  fry: number;
  glaze: number;
  toppings: number;
  box: number;
}

export interface OrderScore extends StationScores {
  wait: number;
  /** Weighted overall score, 0–100. */
  total: number;
  tier: ThanksTier;
  /** Dollars, rounded to cents (including the gift bonus). */
  tip: number;
  /** Extra donuts given away, and the part of the tip they earned. */
  gifts: number;
  giftTip: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** 0–100. A soft curve: full marks for a reasonable wait, then a gentle slide to 0. */
export function waitScore(waitSec: number, patienceSec: number, b: ScoringBalance): number {
  const grace = patienceSec * b.wait.graceShare;
  const zero = patienceSec * b.wait.zeroShare;
  if (waitSec <= grace) return 100;
  if (waitSec >= zero) return 0;
  const x = (waitSec - grace) / (zero - grace);
  return Math.round(50 * (1 + Math.cos(Math.PI * x)));
}

export function tierFor(score: number, b: ScoringBalance): ThanksTier {
  if (score >= b.tiers.great) return 'great';
  if (score >= b.tiers.good) return 'good';
  if (score >= b.tiers.okay) return 'okay';
  return 'bad';
}

/** The tip curve at a score (straight lines between points, flat past the ends). */
export function tipMultiplier(score: number, b: ScoringBalance): number {
  const pts = b.tip.curve;
  const x = (i: number) => pts[i]![0]!;
  const y = (i: number) => pts[i]![1]!;
  if (score <= x(0)) return y(0);
  for (let i = 1; i < pts.length; i++) {
    if (score <= x(i)) return y(i - 1) + ((y(i) - y(i - 1)) * (score - x(i - 1))) / (x(i) - x(i - 1));
  }
  return y(pts.length - 1);
}

export function tipFor(score: number, donuts: number, b: ScoringBalance): number {
  return Math.round(b.tip.perDonut * donuts * tipMultiplier(score, b) * 100) / 100;
}

const TIERS: ThanksTier[] = ['bad', 'okay', 'good', 'great'];

/**
 * Everything about how an order went: the weighted score, reaction tier and
 * tip. Gift donuts don't change the score, but the customer likes you more
 * (their reaction goes up a level) and tips extra.
 */
export function scoreOrder(
  stations: StationScores,
  waitSec: number,
  patienceSec: number,
  donuts: number,
  b: ScoringBalance,
  gifts = 0,
  /** Kolaches and onigiri: each kind's score (0–100) and how many were ordered. */
  sides: readonly { score: number; count: number }[] = [],
): OrderScore {
  const wait = waitScore(waitSec, patienceSec, b);
  const w = b.weights;
  const making = w.fry + w.glaze + w.toppings + w.box;
  const sum = making + w.wait;
  // The donuts' part, then mixed with the sides by how many items each is.
  let quality = making > 0 ? (stations.fry * w.fry + stations.glaze * w.glaze + stations.toppings * w.toppings + stations.box * w.box) / making : 0;
  let items = donuts;
  let sideSum = 0;
  for (const sd of sides) {
    items += sd.count;
    sideSum += sd.score * sd.count;
  }
  if (items > donuts) quality = (quality * donuts + sideSum) / items;
  const total = Math.round(clamp((quality * making + wait * w.wait) / sum, 0, 100));
  const counted = Math.min(Math.max(0, gifts), b.gift.max);
  const giftTip = Math.round(counted * b.gift.tipPerDonut * 100) / 100;
  let tier = tierFor(total, b);
  if (counted > 0) tier = TIERS[Math.min(TIERS.length - 1, TIERS.indexOf(tier) + b.gift.tierBoost)]!;
  return { ...stations, wait, total, tier, tip: Math.round((tipFor(total, items, b) + giftTip) * 100) / 100, gifts, giftTip };
}

/** Problems with the scoring numbers (empty = fine). */
export function validateScoring(b: ScoringBalance): string[] {
  const errors: string[] = [];
  const w = b.weights;
  if (![w.fry, w.glaze, w.toppings, w.box, w.wait].every((x) => x >= 0) || w.fry + w.glaze + w.toppings + w.box + w.wait <= 0) {
    errors.push('scoring.weights must be >= 0 and not all 0');
  }
  if (!(b.wait.graceShare >= 0 && b.wait.zeroShare > b.wait.graceShare)) errors.push('scoring.wait needs 0 <= graceShare < zeroShare');
  if (!(b.tiers.great > b.tiers.good && b.tiers.good > b.tiers.okay)) errors.push('scoring.tiers needs great > good > okay');
  const c = b.tip.curve;
  if (!(b.tip.perDonut >= 0 && c.length >= 2 && c.every((p, i) => p.length === 2 && (i === 0 || p[0]! > c[i - 1]![0]!)))) {
    errors.push('scoring.tip needs perDonut >= 0 and a curve of 2+ points with rising scores');
  }
  if (!(b.gift.tipPerDonut >= 0 && Number.isInteger(b.gift.max) && b.gift.max >= 0 && Number.isInteger(b.gift.tierBoost) && b.gift.tierBoost >= 0)) {
    errors.push('scoring.gift needs tipPerDonut >= 0 and integer max, tierBoost >= 0');
  }
  return errors;
}

/** A word for an order score (0–100). */
export function orderVerdict(score: number, b: ScoringBalance): string {
  switch (tierFor(score, b)) {
    case 'great':
      return 'amazing!';
    case 'good':
      return 'nice work';
    case 'okay':
      return 'not bad';
    default:
      return 'needs work';
  }
}
