// Glaze station logic. Pure: no Phaser. Coordinates are normalised to the
// donut: (0, 0) is the centre and ±1 the edges of its square.
//
// Each donut gets a base coat (a "dip" glaze painted over the whole ring, or a
// "dust" of powdered sugar), then optionally a "drizzle" of stripes. The player
// picks a glaze and paints by dragging; a grid tracks what's been covered.

import { ringBallCenters, ringBallRadius } from './donutGeometry';
import type { GlazeStyle, Menu } from '../systems/menu';

export interface GlazeBalance {
  /** Cells per side of the coverage grid. */
  gridSize: number;
  /** Ring geometry in normalised units (matches how the donut is drawn). */
  ringRadius: number;
  ballOverlap: number;
  /** Painting this close past the ring's edge doesn't count as spill. */
  edgeMargin: number;
  brushRadius: Record<GlazeStyle, number>;
  /** Coverage that earns full marks, per style. */
  goodCoverage: Record<GlazeStyle, number>;
  /** Spill (off-target paint relative to the target's size) at which a layer scores 0. */
  spillZeroAt: number;
  /** Score multiplier for using the wrong glaze. */
  wrongGlazeFactor: number;
  stripes: { count: number; spacing: number; width: number; angleDeg: number; margin: number };
}

/** A painting step: one layer on one donut. */
export interface GlazeStep {
  donutIndex: number;
  flavorId: string;
  kind: 'base' | 'drizzle';
  /** The glaze the order calls for. */
  glazeId: string;
  style: GlazeStyle;
}

export interface GlazeLayer {
  step: GlazeStep;
  /** The glaze the player actually used. */
  usedGlazeId: string;
  /** Flat [x0, y0, x1, y1, ...] segments, normalised, for redrawing. */
  strokes: number[];
  coverage: number;
  spill: number;
  /** 0–1. */
  score: number;
}

export interface GlazeResult {
  ticketNo: number;
  /** 0–100, the average of every layer. */
  score: number;
  layers: GlazeLayer[];
}

export interface Segment {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Target (what should be covered) and allowed (where paint isn't spill) cells for a layer. */
export interface MaskTemplate {
  target: Uint8Array;
  allowed: Uint8Array;
  targetCount: number;
}

function cellCentre(i: number, n: number): number {
  return ((i + 0.5) / n) * 2 - 1;
}

/** Distance from (x, y) to the nearest ball of the ring, minus that ball's radius (< 0 = inside). */
function ringDistance(x: number, y: number, balls: { x: number; y: number }[], r: number): number {
  let best = Infinity;
  for (const p of balls) best = Math.min(best, Math.hypot(x - p.x, y - p.y) - r);
  return best;
}

export function ringMask(b: GlazeBalance): MaskTemplate {
  const n = b.gridSize;
  const balls = ringBallCenters(0, 0, b.ringRadius);
  const r = ringBallRadius(b.ringRadius, balls.length, b.ballOverlap);
  const target = new Uint8Array(n * n);
  const allowed = new Uint8Array(n * n);
  let targetCount = 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const d = ringDistance(cellCentre(i, n), cellCentre(j, n), balls, r);
      const k = j * n + i;
      if (d <= 0) {
        target[k] = 1;
        targetCount++;
      }
      if (d <= b.edgeMargin) allowed[k] = 1;
    }
  }
  return { target, allowed, targetCount };
}

/** The drizzle stripes as lines across the donut (for guides and tests). */
export function stripeGuides(b: GlazeBalance): Segment[] {
  const { count, spacing, angleDeg } = b.stripes;
  const a = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  // Normal to the stripe direction.
  const nx = -dy;
  const ny = dx;
  const out: Segment[] = [];
  for (let k = 0; k < count; k++) {
    const c = (k - (count - 1) / 2) * spacing;
    out.push({ x0: nx * c - dx, y0: ny * c - dy, x1: nx * c + dx, y1: ny * c + dy });
  }
  return out;
}

export function stripeMask(b: GlazeBalance): MaskTemplate {
  const n = b.gridSize;
  const { count, spacing, width, angleDeg, margin } = b.stripes;
  const a = (angleDeg * Math.PI) / 180;
  const nx = -Math.sin(a);
  const ny = Math.cos(a);
  const balls = ringBallCenters(0, 0, b.ringRadius);
  const r = ringBallRadius(b.ringRadius, balls.length, b.ballOverlap);
  const outer = b.ringRadius + r + b.edgeMargin;
  const target = new Uint8Array(n * n);
  const allowed = new Uint8Array(n * n);
  let targetCount = 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = cellCentre(i, n);
      const y = cellCentre(j, n);
      const along = x * nx + y * ny;
      let stripeDist = Infinity;
      for (let s = 0; s < count; s++) stripeDist = Math.min(stripeDist, Math.abs(along - (s - (count - 1) / 2) * spacing));
      const k = j * n + i;
      const onRing = ringDistance(x, y, balls, r) <= 0;
      if (stripeDist <= width / 2 && onRing) {
        target[k] = 1;
        targetCount++;
      }
      // Stripes may cross the hole (icing does); off-stripe or off-donut paint is spill.
      if (stripeDist <= width / 2 + margin && Math.hypot(x, y) <= outer) allowed[k] = 1;
    }
  }
  return { target, allowed, targetCount };
}

/** A coverage grid for one layer. Tracks counts incrementally, so reading them is free. */
export class PaintMask {
  private readonly painted: Uint8Array;
  paintedTotal = 0;
  paintedTarget = 0;
  paintedOutside = 0;

  constructor(
    private readonly tpl: MaskTemplate,
    private readonly n: number,
  ) {
    this.painted = new Uint8Array(n * n);
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

  clear(): void {
    this.painted.fill(0);
    this.paintedTotal = this.paintedTarget = this.paintedOutside = 0;
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
        if (this.tpl.target[k]) this.paintedTarget++;
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

export function layerScore(coverage: number, spill: number, style: GlazeStyle, correctGlaze: boolean, b: GlazeBalance): number {
  const cover = clamp(coverage / b.goodCoverage[style], 0, 1);
  const mess = clamp(spill / b.spillZeroAt, 0, 1);
  return cover * (1 - mess) * (correctGlaze ? 1 : b.wrongGlazeFactor);
}

/** The painting steps for an order: each donut's base coat, then its drizzle if it has one. */
export function glazeSteps(flavors: readonly string[], menu: Menu): GlazeStep[] {
  const steps: GlazeStep[] = [];
  flavors.forEach((flavorId, donutIndex) => {
    const f = menu.flavors.find((x) => x.id === flavorId);
    if (!f) throw new Error(`unknown flavor ${flavorId}`);
    const base = menu.glazes.find((g) => g.id === f.glaze)!;
    steps.push({ donutIndex, flavorId, kind: 'base', glazeId: base.id, style: base.style });
    if (f.drizzle) {
      const d = menu.glazes.find((g) => g.id === f.drizzle)!;
      steps.push({ donutIndex, flavorId, kind: 'drizzle', glazeId: d.id, style: d.style });
    }
  });
  return steps;
}

/** Glazing one order, step by step. Lives in the session so leaving the station keeps progress. */
export class GlazeJob {
  readonly steps: GlazeStep[];
  stepIndex = 0;
  /** The glaze picked for the current step (null until the player picks one). */
  chosen: string | null = null;
  /** Current step's strokes, flat [x0, y0, x1, y1, ...], normalised. */
  strokes: number[] = [];
  readonly layers: GlazeLayer[] = [];
  private readonly ring: MaskTemplate;
  private readonly stripes: MaskTemplate;
  private mask: PaintMask;

  constructor(
    readonly ticketNo: number,
    flavors: readonly string[],
    private readonly menu: Menu,
    private readonly b: GlazeBalance,
  ) {
    this.steps = glazeSteps(flavors, menu);
    this.ring = ringMask(b);
    this.stripes = stripeMask(b);
    this.mask = this.newMask();
  }

  get step(): GlazeStep | undefined {
    return this.steps[this.stepIndex];
  }

  get done(): boolean {
    return this.stepIndex >= this.steps.length;
  }

  get coverage(): number {
    return this.mask.coverage;
  }

  get spill(): number {
    return this.mask.spill;
  }

  get hasPaint(): boolean {
    return this.strokes.length > 0;
  }

  /** Drizzle guides to draw over the donut (only on drizzle steps). */
  get guides(): Segment[] {
    return this.step?.kind === 'drizzle' ? stripeGuides(this.b) : [];
  }

  /** Brush radius (normalised) for a glaze, by its style. */
  brushFor(glazeId: string): number {
    const g = this.menu.glazes.find((x) => x.id === glazeId);
    return this.b.brushRadius[g?.style ?? 'dip'];
  }

  /** Layers already finished on a donut (to redraw it). */
  layersFor(donutIndex: number): GlazeLayer[] {
    return this.layers.filter((l) => l.step.donutIndex === donutIndex);
  }

  /** Pick a glaze. Switching glaze after painting wipes the layer (you can't mix). */
  choose(glazeId: string): void {
    if (this.done) return;
    if (this.chosen !== glazeId && this.hasPaint) this.redo();
    this.chosen = glazeId;
  }

  /** Paint a segment with the chosen glaze. Returns false if no glaze is picked. */
  paint(x0: number, y0: number, x1: number, y1: number): boolean {
    if (this.done || !this.chosen) return false;
    this.mask.stroke(x0, y0, x1, y1, this.brushFor(this.chosen));
    this.strokes.push(x0, y0, x1, y1);
    return true;
  }

  redo(): void {
    this.strokes = [];
    this.mask.clear();
  }

  /** Finish the current layer: score it and move on. */
  finish(): GlazeLayer {
    const step = this.step;
    if (!step || !this.chosen) throw new Error('nothing to finish');
    const used = this.menu.glazes.find((g) => g.id === this.chosen);
    const style = used?.style ?? step.style;
    const layer: GlazeLayer = {
      step,
      usedGlazeId: this.chosen,
      strokes: this.strokes,
      coverage: this.mask.coverage,
      spill: this.mask.spill,
      score: layerScore(this.mask.coverage, this.mask.spill, style, this.chosen === step.glazeId, this.b),
    };
    this.layers.push(layer);
    this.stepIndex++;
    this.chosen = null;
    this.strokes = [];
    this.mask = this.newMask();
    return layer;
  }

  result(): GlazeResult {
    const n = Math.max(this.layers.length, 1);
    return {
      ticketNo: this.ticketNo,
      score: Math.round((this.layers.reduce((s, l) => s + l.score, 0) / n) * 100),
      layers: [...this.layers],
    };
  }

  private newMask(): PaintMask {
    const tpl = this.step?.kind === 'drizzle' ? this.stripes : this.ring;
    return new PaintMask(tpl, this.b.gridSize);
  }
}

/** A short word for a glaze score. */
export function glazeVerdict(score: number): string {
  if (score >= 90) return 'gorgeous glaze!';
  if (score >= 70) return 'nicely glazed';
  if (score >= 40) return 'a bit messy';
  return 'oof, sticky situation';
}
