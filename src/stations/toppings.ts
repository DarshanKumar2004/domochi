// Toppings station logic. Pure: no Phaser. Coordinates are normalised to the
// donut like the glaze station: (0, 0) is the centre and ±1 the edges.
//
// A glazed donut from the shelf goes on the board. Sprinkle toppings (crushed
// cookies, cereal) are shaken on as many small pieces; piece toppings (a whole
// cookie butter cookie) are placed one at a time. Pieces that land off the
// ring fall off: they don't count, and they count as mess. The finished donut
// goes back on the shelf, and is scored later against the flavour it's served
// as (toppingScoreFor).

import { ringBallCenters, ringBallRadius } from './donutGeometry';
import type { GlazedDonut } from './glaze';
import type { Flavor, Menu, Topping } from '../systems/menu';

export interface ToppingsBalance {
  /** Donuts on the toppings tray at once. */
  boards?: number;
  /** While shaking a sprinkle jar, one piece falls this often (ms). */
  sprinkleEveryMs: number;
  /** Sprinkle pieces land up to this far from the finger (normalised). */
  scatter: number;
  /** How long a piece takes to fall onto the donut (ms). */
  fallMs: number;
  /** Most pieces one donut can hold (keeps drawing cheap). */
  maxPieces: number;
  /** A piece this close past the ring's edge still sticks. */
  onDonutMargin: number;
  /** Too much of a topping scores 0 at amount.max × this. */
  tooMuchZeroAtFactor: number;
  /** Evenness when every piece is on one ball; all 8 balls covered is 1. */
  evennessFloor: number;
  /** Share of pieces that fell off at which a topping scores 0. */
  messZeroAt: number;
  /** Score multiplier for each topping the flavour doesn't have. */
  unwantedFactor: number;
}

/** Ring geometry shared with the glaze station (same art). */
export interface Ring {
  ringRadius: number;
  ballOverlap: number;
}

export interface ToppingPiece {
  toppingId: string;
  x: number;
  y: number;
  /** Rotation in radians, for drawing. */
  rot: number;
  /** Stuck on the donut (true) or fell off (false: drawn nowhere, counted as mess). */
  on: boolean;
  /** Which of the 8 balls it sits on (-1 if it fell off). */
  ball: number;
}

/** A glazed donut with its toppings. Donuts that skip the Toppings station have none. */
export type FinishedDonut = GlazedDonut & { toppings?: ToppingPiece[] };

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Which ball (0–7) a point sits on, or -1 if it's off the ring. */
export function ballAt(x: number, y: number, ring: Ring, margin: number): number {
  const balls = ringBallCenters(0, 0, ring.ringRadius);
  const r = ringBallRadius(ring.ringRadius, balls.length, ring.ballOverlap);
  let best = -1;
  let bestD = Infinity;
  for (let k = 0; k < balls.length; k++) {
    const d = Math.hypot(x - balls[k]!.x, y - balls[k]!.y);
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  return bestD <= r + margin ? best : -1;
}

/** Quality (0–1) of one topping's pieces: the right amount, spread over the balls, little falling off. */
export function toppingQuality(pieces: readonly ToppingPiece[], topping: Topping, b: ToppingsBalance): number {
  let on = 0;
  let off = 0;
  let balls = 0;
  for (const p of pieces) {
    if (p.toppingId !== topping.id) continue;
    if (p.on) {
      on++;
      balls |= 1 << p.ball;
    } else off++;
  }
  if (on === 0) return 0;
  const { min, max } = topping.amount;
  const zeroAt = max * b.tooMuchZeroAtFactor;
  const amount = on < min ? on / min : on <= max ? 1 : clamp(1 - (on - max) / (zeroAt - max), 0, 1);
  let covered = 0;
  for (let k = 0; k < 8; k++) if (balls & (1 << k)) covered++;
  // A single cookie sits on one spot by design: only sprinkles are judged on spread.
  const evenness = topping.style === 'sprinkle' ? b.evennessFloor + (1 - b.evennessFloor) * (covered / 8) : 1;
  const mess = clamp(off / (on + off) / b.messZeroAt, 0, 1);
  return amount * evenness * (1 - mess);
}

/** Topping ids that have at least one piece stuck on the donut. */
export function toppingsOn(d: FinishedDonut): Set<string> {
  const ids = new Set<string>();
  for (const p of d.toppings ?? []) if (p.on) ids.add(p.toppingId);
  return ids;
}

/** How well a donut's toppings match a flavour (0–1). A flavour with no toppings wants none. */
export function toppingScoreFor(d: FinishedDonut, flavor: Flavor, menu: Menu, b: ToppingsBalance): number {
  const on = toppingsOn(d);
  let unwanted = 0;
  for (const id of on) if (!flavor.toppings.includes(id)) unwanted++;
  const penalty = b.unwantedFactor ** unwanted;
  if (flavor.toppings.length === 0) return penalty;
  let sum = 0;
  for (const id of flavor.toppings) {
    const t = menu.toppings.find((x) => x.id === id);
    if (t) sum += toppingQuality(d.toppings ?? [], t, b);
  }
  return (sum / flavor.toppings.length) * penalty;
}

/** One donut on the toppings board. */
export class ToppingWork {
  readonly pieces: ToppingPiece[];

  constructor(
    readonly donut: FinishedDonut,
    private readonly menu: Menu,
    private readonly b: ToppingsBalance,
    private readonly ring: Ring,
  ) {
    // Toppings already on it stay (you can add more).
    this.pieces = [...(donut.toppings ?? [])];
  }

  get full(): boolean {
    return this.pieces.length >= this.b.maxPieces;
  }

  /** Pieces of each topping stuck on (for the readout). */
  countOn(toppingId: string): number {
    let n = 0;
    for (const p of this.pieces) if (p.on && p.toppingId === toppingId) n++;
    return n;
  }

  /**
   * A piece lands at (x, y). `rand` (0–1) sets its rotation. Returns the piece,
   * or null if the topping is unknown or the donut can't hold more.
   */
  add(toppingId: string, x: number, y: number, rand: number): ToppingPiece | null {
    if (this.full || !this.menu.toppings.some((t) => t.id === toppingId)) return null;
    const ball = ballAt(x, y, this.ring, this.b.onDonutMargin);
    const piece: ToppingPiece = { toppingId, x, y, rot: rand * Math.PI * 2, on: ball >= 0, ball };
    this.pieces.push(piece);
    return piece;
  }

  /** Done: the donut with its toppings. */
  finish(): FinishedDonut {
    return { ...this.donut, toppings: [...this.pieces] };
  }
}

/** A short word for a toppings score (0–100). */
export function toppingsVerdict(score: number): string {
  if (score >= 90) return 'perfectly topped!';
  if (score >= 70) return 'nice toppings';
  if (score >= 40) return 'a little uneven';
  return 'toppings went everywhere';
}
