import { describe, expect, it } from 'vitest';
import balanceJson from '../../src/data/balance.json';
import menuJson from '../../src/data/menu.json';
import type { Balance } from '../../src/systems/balance';
import type { Menu } from '../../src/systems/menu';
import { ringBallCenters } from '../../src/stations/donutGeometry';
import { GlazeJob, glazeSteps, layerScore, PaintMask, ringMask, stripeGuides, stripeMask } from '../../src/stations/glaze';

const B = (balanceJson as Balance).glaze;
const menu = menuJson as Menu;

/** Paint the whole ring the way a careful player would: circle around it a few times. */
function paintRing(paint: (x0: number, y0: number, x1: number, y1: number) => void): void {
  for (const radius of [B.ringRadius - 0.14, B.ringRadius, B.ringRadius + 0.14]) {
    const steps = 48;
    for (let s = 0; s < steps; s++) {
      const a0 = (s / steps) * Math.PI * 2;
      const a1 = ((s + 1) / steps) * Math.PI * 2;
      paint(Math.cos(a0) * radius, Math.sin(a0) * radius, Math.cos(a1) * radius, Math.sin(a1) * radius);
    }
  }
}

/** Trace each drizzle guide across the donut. */
function paintStripes(paint: (x0: number, y0: number, x1: number, y1: number) => void): void {
  for (const g of stripeGuides(B)) paint(g.x0 * 0.9, g.y0 * 0.9, g.x1 * 0.9, g.y1 * 0.9);
}

describe('masks', () => {
  it('the ring target covers the balls and not the hole or corners', () => {
    const m = ringMask(B);
    const n = B.gridSize;
    const cell = (x: number, y: number) => Math.floor(((y + 1) / 2) * n) * n + Math.floor(((x + 1) / 2) * n);
    const ball = ringBallCenters(0, 0, B.ringRadius)[0]!;
    expect(m.target[cell(ball.x, ball.y)]).toBe(1);
    expect(m.target[cell(0, 0)]).toBe(0); // the hole
    expect(m.target[cell(0.98, 0.98)]).toBe(0); // a corner
    expect(m.targetCount).toBeGreaterThan(n * n * 0.25);
  });

  it('stripe targets are a thin subset of the ring', () => {
    const ring = ringMask(B);
    const stripes = stripeMask(B);
    expect(stripes.targetCount).toBeGreaterThan(0);
    expect(stripes.targetCount).toBeLessThan(ring.targetCount * 0.5);
    for (let k = 0; k < stripes.target.length; k++) if (stripes.target[k]) expect(ring.target[k]).toBe(1);
  });
});

describe('PaintMask', () => {
  it('stamping is idempotent: painting the same spot twice counts once', () => {
    const m = new PaintMask(ringMask(B), B.gridSize);
    m.stamp(0, -B.ringRadius, 0.1);
    const once = m.paintedTotal;
    m.stamp(0, -B.ringRadius, 0.1);
    expect(m.paintedTotal).toBe(once);
  });

  it('a careful ring paint covers most of it with little spill', () => {
    const m = new PaintMask(ringMask(B), B.gridSize);
    paintRing((a, b, c, d) => m.stroke(a, b, c, d, B.brushRadius.dip));
    expect(m.coverage).toBeGreaterThan(0.9);
    expect(m.spill).toBeLessThan(0.1);
    expect(layerScore(m.coverage, m.spill, 'dip', true, B)).toBeGreaterThan(0.85);
  });

  it('scribbling all over the board is mostly spill', () => {
    const m = new PaintMask(ringMask(B), B.gridSize);
    for (let y = -1; y <= 1; y += 0.1) m.stroke(-1, y, 1, y, B.brushRadius.dip);
    expect(m.coverage).toBe(1);
    expect(m.spill).toBeGreaterThan(B.spillZeroAt);
    expect(layerScore(m.coverage, m.spill, 'dip', true, B)).toBe(0);
  });

  it('tracing the drizzle guides covers the stripes cleanly', () => {
    const m = new PaintMask(stripeMask(B), B.gridSize);
    paintStripes((a, b, c, d) => m.stroke(a, b, c, d, B.brushRadius.drizzle));
    expect(m.coverage).toBeGreaterThan(B.goodCoverage.drizzle);
    expect(m.spill).toBeLessThan(0.1);
  });
});

describe('layerScore', () => {
  it('full coverage with no spill is perfect; the wrong glaze is heavily penalised', () => {
    expect(layerScore(1, 0, 'dip', true, B)).toBe(1);
    expect(layerScore(1, 0, 'dip', false, B)).toBe(B.wrongGlazeFactor);
  });

  it('coverage past goodCoverage earns full marks; spill at spillZeroAt scores 0', () => {
    expect(layerScore(B.goodCoverage.dip, 0, 'dip', true, B)).toBe(1);
    expect(layerScore(1, B.spillZeroAt, 'dip', true, B)).toBe(0);
  });
});

describe('glazeSteps for the real menu', () => {
  it('strawberry: strawberry glaze, then a white icing drizzle', () => {
    expect(glazeSteps(['strawberry'], menu).map((s) => [s.kind, s.glazeId, s.style])).toEqual([
      ['base', 'strawberry', 'dip'],
      ['drizzle', 'white-icing', 'drizzle'],
    ]);
  });

  it('beignet: a dusting of powdered sugar only', () => {
    expect(glazeSteps(['beignet'], menu).map((s) => [s.kind, s.glazeId, s.style])).toEqual([['base', 'powdered-sugar', 'dust']]);
  });

  it('a multi-donut order glazes each donut in turn', () => {
    const steps = glazeSteps(['cookies-and-cream', 'cookie-butter'], menu);
    expect(steps.map((s) => s.donutIndex)).toEqual([0, 1, 1]);
  });
});

describe('GlazeJob', () => {
  it('must pick a glaze before painting', () => {
    const job = new GlazeJob(1, ['strawberry'], menu, B);
    expect(job.paint(0, 0, 0.1, 0.1)).toBe(false);
    job.choose('strawberry');
    expect(job.paint(0, -0.6, 0.1, -0.6)).toBe(true);
    expect(job.hasPaint).toBe(true);
  });

  it('switching glaze after painting wipes the layer', () => {
    const job = new GlazeJob(1, ['strawberry'], menu, B);
    job.choose('strawberry');
    job.paint(0, -0.6, 0.2, -0.6);
    job.choose('cookies-and-cream');
    expect(job.hasPaint).toBe(false);
    expect(job.coverage).toBe(0);
  });

  it('a well-made strawberry scores high; guides only show on the drizzle step', () => {
    const job = new GlazeJob(7, ['strawberry'], menu, B);
    expect(job.guides).toEqual([]);
    job.choose('strawberry');
    paintRing((a, b, c, d) => job.paint(a, b, c, d));
    job.finish();
    expect(job.step?.kind).toBe('drizzle');
    expect(job.guides).toHaveLength(B.stripes.count);
    job.choose('white-icing');
    paintStripes((a, b, c, d) => job.paint(a, b, c, d));
    job.finish();
    expect(job.done).toBe(true);
    const r = job.result();
    expect(r.ticketNo).toBe(7);
    expect(r.layers).toHaveLength(2);
    expect(r.score).toBeGreaterThanOrEqual(75);
    expect(job.layersFor(0)).toHaveLength(2);
  });

  it('the wrong glaze drags the score down', () => {
    const right = new GlazeJob(1, ['cookies-and-cream'], menu, B);
    right.choose('cookies-and-cream');
    paintRing((a, b, c, d) => right.paint(a, b, c, d));
    right.finish();
    const wrong = new GlazeJob(1, ['cookies-and-cream'], menu, B);
    wrong.choose('strawberry');
    paintRing((a, b, c, d) => wrong.paint(a, b, c, d));
    wrong.finish();
    expect(wrong.result().score).toBeLessThan(right.result().score * 0.5);
  });

  it('cannot finish before picking a glaze', () => {
    expect(() => new GlazeJob(1, ['beignet'], menu, B).finish()).toThrow();
  });
});
