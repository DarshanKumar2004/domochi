// Glaze station logic. Pure: no Phaser. Coordinates are normalised to the
// donut: (0, 0) is the centre and ±1 the edges of its square.
//
// Glazing is a production line, like frying: a fried donut from the rack goes
// on the board, the player pours a base coat (a "dip" glaze or a "dust" of
// powdered sugar) and optionally a "drizzle", then it goes to the glazed shelf.
// It's scored later, against the flavour it's served as (glazeScoreFor).

import { ringBallCenters, ringBallRadius } from './donutGeometry';
import type { FriedDonut } from './fry';
import type { Flavor, GlazeStyle, Menu } from '../systems/menu';

export interface GlazeBalance {
  /** Cells per side of the coverage grid. */
  gridSize: number;
  /** Ring geometry in normalised units (matches how the donut is drawn). */
  ringRadius: number;
  ballOverlap: number;
  /** Paint this close past the ring's edge doesn't count as spill. */
  edgeMargin: number;
  brushRadius: Record<GlazeStyle, number>;
  /** Base-coat coverage that earns full marks, per style. */
  goodCoverage: { dip: number; dust: number };
  /** Drizzle should cover between idealMin and idealMax of the ring; 0 points at zeroAt. */
  drizzleAmount: { idealMin: number; idealMax: number; zeroAt: number };
  /** A ball counts as drizzled once this share of it is covered. */
  drizzleBallTouched: number;
  /** Spill (off-target paint relative to the target's size) at which a layer scores 0. */
  spillZeroAt: number;
  /** Score multiplier for the wrong glaze. */
  wrongGlazeFactor: number;
  /** Drizzle component when the flavour needs a drizzle and there isn't one. */
  missingDrizzleScore: number;
  /** Score multiplier for a drizzle the flavour doesn't have. */
  unwantedDrizzleFactor: number;
  /** Share of a donut's glaze score that is the drizzle, when the flavour has one. */
  drizzleWeight: number;
  /** How long poured glaze takes to fall onto the donut (ms). */
  fallMs: number;
  /** Most glazed donuts the shelf holds. */
  shelfCapacity: number;
}

export type LayerKind = 'base' | 'drizzle';

export interface GlazeLayer {
  kind: LayerKind;
  glazeId: string;
  style: GlazeStyle;
  /** Flat [x0, y0, x1, y1, ...] poured segments, normalised, for redrawing. */
  segments: number[];
  coverage: number;
  spill: number;
  /** How many of the 8 balls got some of this layer. */
  ballsTouched: number;
}

/** A finished glazed donut, waiting on the shelf. */
export interface GlazedDonut {
  id: number;
  fry: FriedDonut;
  layers: GlazeLayer[];
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Target (the ring), allowed (where paint isn't spill) and which ball each cell belongs to. */
export interface MaskTemplate {
  target: Uint8Array;
  allowed: Uint8Array;
  targetCount: number;
  /** Ball index for each target cell, -1 elsewhere. */
  ballOf: Int8Array;
  ballCells: number[];
}

function cellCentre(i: number, n: number): number {
  return ((i + 0.5) / n) * 2 - 1;
}

export function ringMask(b: GlazeBalance): MaskTemplate {
  const n = b.gridSize;
  const balls = ringBallCenters(0, 0, b.ringRadius);
  const r = ringBallRadius(b.ringRadius, balls.length, b.ballOverlap);
  const target = new Uint8Array(n * n);
  const allowed = new Uint8Array(n * n);
  const ballOf = new Int8Array(n * n).fill(-1);
  const ballCells = new Array<number>(balls.length).fill(0);
  let targetCount = 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = cellCentre(i, n);
      const y = cellCentre(j, n);
      let best = Infinity;
      let bestBall = -1;
      balls.forEach((p, k) => {
        const d = Math.hypot(x - p.x, y - p.y) - r;
        if (d < best) {
          best = d;
          bestBall = k;
        }
      });
      const idx = j * n + i;
      if (best <= 0) {
        target[idx] = 1;
        targetCount++;
        ballOf[idx] = bestBall;
        ballCells[bestBall]!++;
      }
      if (best <= b.edgeMargin) allowed[idx] = 1;
    }
  }
  return { target, allowed, targetCount, ballOf, ballCells };
}

/** A coverage grid for one layer. Counts update incrementally, so reading them is free. */
export class PaintMask {
  private readonly painted: Uint8Array;
  private readonly perBall: number[];
  paintedTotal = 0;
  paintedTarget = 0;
  paintedOutside = 0;

  constructor(
    private readonly tpl: MaskTemplate,
    private readonly n: number,
  ) {
    this.painted = new Uint8Array(n * n);
    this.perBall = new Array<number>(tpl.ballCells.length).fill(0);
  }

  get coverage(): number {
    return this.tpl.targetCount ? this.paintedTarget / this.tpl.targetCount : 0;
  }

  /**
   * Paint outside the allowed area, relative to the size of the target. Measured
   * against the target (not against total paint) so scrubbing everywhere can't
   * dilute its own mess: careful ≈ 0.04, sloppy ≈ 0.3, scrub-everything ≈ 0.75.
   */
  get spill(): number {
    return this.tpl.targetCount ? this.paintedOutside / this.tpl.targetCount : 0;
  }

  ballsTouched(threshold: number): number {
    let n = 0;
    this.perBall.forEach((c, k) => {
      if (c / (this.tpl.ballCells[k] || 1) >= threshold) n++;
    });
    return n;
  }

  /** Paint a disc of radius r at (x, y). */
  stamp(x: number, y: number, r: number): void {
    const n = this.n;
    const toCell = (v: number) => ((v + 1) / 2) * n - 0.5;
    const rc = (r / 2) * n;
    const ci = toCell(x);
    const cj = toCell(y);
    const i0 = Math.max(0, Math.floor(ci - rc));
    const i1 = Math.min(n - 1, Math.ceil(ci + rc));
    const j0 = Math.max(0, Math.floor(cj - rc));
    const j1 = Math.min(n - 1, Math.ceil(cj + rc));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        if ((i - ci) ** 2 + (j - cj) ** 2 > rc * rc) continue;
        const k = j * n + i;
        if (this.painted[k]) continue;
        this.painted[k] = 1;
        this.paintedTotal++;
        if (this.tpl.target[k]) {
          this.paintedTarget++;
          const ball = this.tpl.ballOf[k]!;
          if (ball >= 0) this.perBall[ball]!++;
        }
        if (!this.tpl.allowed[k]) this.paintedOutside++;
      }
    }
  }

  /** Paint along a segment, stamping often enough to leave no gaps. */
  stroke(x0: number, y0: number, x1: number, y1: number, r: number): void {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(len / (r * 0.5)));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      this.stamp(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r);
    }
  }
}

/** Quality of a base coat (0–1): coverage, minus spill, × wrong-glaze penalty. */
export function layerScore(coverage: number, spill: number, style: 'dip' | 'dust', correctGlaze: boolean, b: GlazeBalance): number {
  const cover = clamp(coverage / b.goodCoverage[style], 0, 1);
  const mess = clamp(spill / b.spillZeroAt, 0, 1);
  return cover * (1 - mess) * (correctGlaze ? 1 : b.wrongGlazeFactor);
}

/** Quality of a drizzle (0–1): the right amount, spread over all the balls, little spill. */
export function drizzleQuality(layer: Pick<GlazeLayer, 'coverage' | 'spill' | 'ballsTouched'>, b: GlazeBalance): number {
  const { idealMin, idealMax, zeroAt } = b.drizzleAmount;
  const a = layer.coverage;
  const amount = a < idealMin ? a / idealMin : a <= idealMax ? 1 : clamp(1 - (a - idealMax) / (zeroAt - idealMax), 0, 1);
  const spread = 0.5 + 0.5 * (layer.ballsTouched / 8);
  return amount * spread * (1 - clamp(layer.spill / b.spillZeroAt, 0, 1));
}

/** How well a glazed donut matches a flavour (0–1). */
export function glazeScoreFor(d: GlazedDonut, flavor: Flavor, b: GlazeBalance): number {
  const base = d.layers.find((l) => l.kind === 'base');
  const drizzle = d.layers.find((l) => l.kind === 'drizzle');
  const baseScore = base && base.style !== 'drizzle' ? layerScore(base.coverage, base.spill, base.style, base.glazeId === flavor.glaze, b) : 0;
  if (flavor.drizzle) {
    const drizzleScore = drizzle ? drizzleQuality(drizzle, b) * (drizzle.glazeId === flavor.drizzle ? 1 : b.wrongGlazeFactor) : b.missingDrizzleScore;
    return (1 - b.drizzleWeight) * baseScore + b.drizzleWeight * drizzleScore;
  }
  return baseScore * (drizzle ? b.unwantedDrizzleFactor : 1);
}

export type PourCheck = 'ok' | 'hasBase' | 'hasDrizzle' | 'drizzleFirst' | 'unknown';

/** One donut on the glazing board. */
export class GlazeWork {
  readonly layers: GlazeLayer[] = [];
  private current: { layer: GlazeLayer; mask: PaintMask } | null = null;
  private readonly tpl: MaskTemplate;

  constructor(
    readonly id: number,
    readonly fry: FriedDonut,
    private readonly menu: Menu,
    private readonly b: GlazeBalance,
    tpl?: MaskTemplate,
  ) {
    this.tpl = tpl ?? ringMask(b);
  }

  /** Every layer, finished and in progress, bottom first (for drawing). */
  get allLayers(): GlazeLayer[] {
    return this.current ? [...this.layers, this.current.layer] : [...this.layers];
  }

  get hasGlaze(): boolean {
    return this.layers.length > 0 || (this.current?.layer.segments.length ?? 0) > 0;
  }

  /** The layer being poured right now, if any. */
  get currentLayer(): GlazeLayer | undefined {
    return this.current?.layer;
  }

  kindOf(glazeId: string): LayerKind | null {
    const g = this.menu.glazes.find((x) => x.id === glazeId);
    return g ? (g.style === 'drizzle' ? 'drizzle' : 'base') : null;
  }

  brushFor(glazeId: string): number {
    const g = this.menu.glazes.find((x) => x.id === glazeId);
    return this.b.brushRadius[g?.style ?? 'dip'];
  }

  /** Can this glaze be poured now? One base coat (first) and one drizzle per donut. */
  canPour(glazeId: string): PourCheck {
    const kind = this.kindOf(glazeId);
    if (!kind) return 'unknown';
    const all = this.allLayers;
    const sameKind = all.find((l) => l.kind === kind);
    if (sameKind && sameKind.glazeId !== glazeId) return kind === 'base' ? 'hasBase' : 'hasDrizzle';
    if (kind === 'base' && all.some((l) => l.kind === 'drizzle')) return 'drizzleFirst';
    return 'ok';
  }

  /** Glaze landing along a segment. Returns false if this glaze can't be poured now. */
  pour(glazeId: string, x0: number, y0: number, x1: number, y1: number): boolean {
    if (this.canPour(glazeId) !== 'ok') return false;
    if (this.current?.layer.glazeId !== glazeId) {
      this.closeCurrent();
      const existing = this.layers.findIndex((l) => l.glazeId === glazeId);
      if (existing >= 0) {
        // Back to a layer you'd already started: keep adding to it.
        const layer = this.layers.splice(existing, 1)[0]!;
        const mask = new PaintMask(this.tpl, this.b.gridSize);
        const r = this.brushFor(glazeId);
        for (let k = 0; k < layer.segments.length; k += 4) {
          mask.stroke(layer.segments[k]!, layer.segments[k + 1]!, layer.segments[k + 2]!, layer.segments[k + 3]!, r);
        }
        this.current = { layer, mask };
      } else {
        const g = this.menu.glazes.find((x) => x.id === glazeId)!;
        this.current = {
          layer: { kind: this.kindOf(glazeId)!, glazeId, style: g.style, segments: [], coverage: 0, spill: 0, ballsTouched: 0 },
          mask: new PaintMask(this.tpl, this.b.gridSize),
        };
      }
    }
    const { layer, mask } = this.current!;
    mask.stroke(x0, y0, x1, y1, this.brushFor(glazeId));
    layer.segments.push(x0, y0, x1, y1);
    layer.coverage = mask.coverage;
    layer.spill = mask.spill;
    layer.ballsTouched = mask.ballsTouched(this.b.drizzleBallTouched);
    return true;
  }

  /** Done: the finished donut, base coat first. */
  finish(): GlazedDonut {
    this.closeCurrent();
    const layers = [...this.layers].sort((a, c) => (a.kind === c.kind ? 0 : a.kind === 'base' ? -1 : 1));
    return { id: this.id, fry: this.fry, layers };
  }

  private closeCurrent(): void {
    if (this.current && this.current.layer.segments.length) this.layers.push(this.current.layer);
    this.current = null;
  }
}

/** A short word for a glaze score (0–100). */
export function glazeVerdict(score: number): string {
  if (score >= 90) return 'gorgeous glaze!';
  if (score >= 70) return 'nicely glazed';
  if (score >= 40) return 'a bit messy';
  return 'oof, sticky situation';
}
