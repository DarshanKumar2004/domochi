import { describe, expect, it } from 'vitest';
import balanceJson from '../../src/data/balance.json';
import menuJson from '../../src/data/menu.json';
import type { Balance } from '../../src/systems/balance';
import type { Flavor, Menu, Stripe } from '../../src/systems/menu';
import { ringBallCenters } from '../../src/stations/donutGeometry';
import type { FriedDonut } from '../../src/stations/fry';
import { drizzlePatternQuality, drizzleQuality, GlazeWork, glazeScoreFor, layerScore, PaintMask, ringMask } from '../../src/stations/glaze';

const B = (balanceJson as Balance).glaze;
const menu = menuJson as Menu;
const flavor = (id: string) => menu.flavors.find((f) => f.id === id) as Flavor;
const fried: FriedDonut = { id: 1, a: 1, b: 1, temperature: 1, score: 100 };

type Pour = (x0: number, y0: number, x1: number, y1: number) => void;

/** Pour all around the ring the way a careful player would. */
function pourRing(pour: Pour): void {
  for (const radius of [B.ringRadius - 0.14, B.ringRadius, B.ringRadius + 0.14]) {
    const steps = 48;
    for (let s = 0; s < steps; s++) {
      const a0 = (s / steps) * Math.PI * 2;
      const a1 = ((s + 1) / steps) * Math.PI * 2;
      pour(Math.cos(a0) * radius, Math.sin(a0) * radius, Math.cos(a1) * radius, Math.sin(a1) * radius);
    }
  }
}

/**
 * A Freezeria-style drizzle: a few stripes across the donut, kept on it. The
 * stream is as thick as the glaze, so 3 stripes cover about half the ring.
 */
function zigzag(pour: Pour, passes = 3, span = 0.6): void {
  for (let k = 0; k < passes; k++) {
    const y = -span + (2 * span * k) / (passes - 1);
    const x = Math.sqrt(0.8 * 0.8 - y * y);
    pour(-x, y, x, y);
  }
}

describe('ring mask', () => {
  it('covers the balls and not the hole or corners, and knows each ball', () => {
    const m = ringMask(B);
    const n = B.gridSize;
    const cell = (x: number, y: number) => Math.floor(((y + 1) / 2) * n) * n + Math.floor(((x + 1) / 2) * n);
    const ball = ringBallCenters(0, 0, B.ringRadius)[3]!;
    expect(m.target[cell(ball.x, ball.y)]).toBe(1);
    expect(m.ballOf[cell(ball.x, ball.y)]).toBe(3);
    expect(m.target[cell(0, 0)]).toBe(0);
    expect(m.target[cell(0.98, 0.98)]).toBe(0);
    expect(m.ballCells.reduce((a, b) => a + b, 0)).toBe(m.targetCount);
  });
});

describe('PaintMask', () => {
  it('painting the same spot twice counts once', () => {
    const m = new PaintMask(ringMask(B), B.gridSize);
    m.stamp(0, -B.ringRadius, 0.1);
    const once = m.paintedTotal;
    m.stamp(0, -B.ringRadius, 0.1);
    expect(m.paintedTotal).toBe(once);
  });

  it('careful = high coverage, little spill; scrubbing everything = lots of spill', () => {
    const careful = new PaintMask(ringMask(B), B.gridSize);
    pourRing((a, b, c, d) => careful.stroke(a, b, c, d, B.brushRadius.dip));
    expect(careful.coverage).toBeGreaterThan(0.9);
    expect(careful.spill).toBeLessThan(0.1);

    const scrub = new PaintMask(ringMask(B), B.gridSize);
    for (let y = -1; y <= 1; y += 0.1) scrub.stroke(-1, y, 1, y, B.brushRadius.dip);
    expect(scrub.spill).toBeGreaterThan(B.spillZeroAt);
  });

  it('counts how many balls got paint', () => {
    const m = new PaintMask(ringMask(B), B.gridSize);
    const [b0] = ringBallCenters(0, 0, B.ringRadius);
    m.stamp(b0!.x, b0!.y, 0.15);
    expect(m.ballsTouched(B.drizzleBallTouched)).toBe(1);
  });
});

describe('scores', () => {
  it('layerScore: full and clean is perfect; wrong glaze is penalised', () => {
    expect(layerScore(1, 0, 'dip', true, B)).toBe(1);
    expect(layerScore(1, 0, 'dip', false, B)).toBe(B.wrongGlazeFactor);
    expect(layerScore(1, B.spillZeroAt, 'dip', true, B)).toBe(0);
  });

  it('drizzleQuality: the right amount spread over every ball', () => {
    const ideal = (B.drizzleAmount.idealMin + B.drizzleAmount.idealMax) / 2;
    expect(drizzleQuality({ coverage: ideal, spill: 0, ballsTouched: 8 }, B)).toBe(1);
    expect(drizzleQuality({ coverage: ideal, spill: 0, ballsTouched: 4 }, B)).toBe(0.75);
    expect(drizzleQuality({ coverage: B.drizzleAmount.idealMin / 2, spill: 0, ballsTouched: 8 }, B)).toBeCloseTo(0.5);
    expect(drizzleQuality({ coverage: B.drizzleAmount.zeroAt, spill: 0, ballsTouched: 8 }, B)).toBe(0);
  });
});

describe('GlazeWork', () => {
  it('one base glaze (first) and one drizzle per donut', () => {
    const w = new GlazeWork(1, fried, menu, B);
    expect(w.canPour('white-icing')).toBe('ok');
    w.pour('strawberry', 0, -0.6, 0.1, -0.6);
    expect(w.canPour('cookies-and-cream')).toBe('hasBase');
    w.pour('white-icing', -0.5, 0, 0.5, 0);
    expect(w.canPour('strawberry')).toBe('drizzleFirst');
    expect(w.pour('cookies-and-cream', 0, 0, 0.1, 0)).toBe(false);
  });

  it('switching back to a started layer keeps adding to it', () => {
    const w = new GlazeWork(1, fried, menu, B);
    w.pour('strawberry', 0, -0.65, 0.2, -0.65);
    const first = w.currentLayer!.coverage;
    w.pour('white-icing', -0.5, 0, 0.5, 0);
    expect(w.canPour('strawberry')).toBe('drizzleFirst');
    expect(first).toBeGreaterThan(0);
  });

  it('finish puts the base coat first', () => {
    const w = new GlazeWork(5, fried, menu, B);
    w.pour('strawberry', 0, -0.6, 0.1, -0.6);
    w.pour('white-icing', -0.5, 0, 0.5, 0);
    const d = w.finish();
    expect(d.id).toBe(5);
    expect(d.layers.map((l) => l.kind)).toEqual(['base', 'drizzle']);
  });
});

describe('glazeScoreFor: matching a glazed donut to a flavour', () => {
  /** Glaze a donut; the drizzle follows `pattern` stripes if given, else a generic zig-zag. */
  function make(base: string | null, drizzle: string | null, pattern?: readonly Stripe[]) {
    const w = new GlazeWork(1, fried, menu, B);
    if (base) pourRing((a, b, c, d) => w.pour(base, a, b, c, d));
    if (drizzle && pattern) for (const s of pattern) w.pour(drizzle, s.x0, s.y0, s.x1, s.y1);
    else if (drizzle) zigzag((a, b, c, d) => w.pour(drizzle, a, b, c, d));
    return w.finish();
  }

  it("a careful strawberry, drizzled along the shop's stripes, scores high as strawberry", () => {
    const pattern = flavor('strawberry').drizzlePattern!;
    expect(glazeScoreFor(make('strawberry', 'white-icing', pattern), flavor('strawberry'), B)).toBeGreaterThan(0.9);
  });

  it("a drizzle that ignores the flavour's stripes scores much less; the wrong half scores about nothing", () => {
    const f = flavor('strawberry');
    const right = drizzlePatternQuality(make(null, 'white-icing', f.drizzlePattern).layers[0]!, f.drizzlePattern!, B);
    const generic = drizzlePatternQuality(make(null, 'white-icing').layers[0]!, f.drizzlePattern!, B);
    const mirrored = f.drizzlePattern!.map((s) => ({ x0: -s.x0, y0: s.y0, x1: -s.x1, y1: s.y1 }));
    const wrongHalf = drizzlePatternQuality(make(null, 'white-icing', mirrored).layers[0]!, f.drizzlePattern!, B);
    expect(right).toBeCloseTo(1);
    expect(generic).toBeLessThan(0.6);
    expect(wrongHalf).toBeLessThan(0.15);
  });

  it('every drizzled flavour on the menu has stripes from the photos, and they score 100% when followed', () => {
    for (const f of menu.flavors.filter((x) => x.drizzle)) {
      expect(f.drizzlePattern?.length).toBeGreaterThan(0);
      expect(drizzlePatternQuality(make(null, f.drizzle!, f.drizzlePattern).layers[0]!, f.drizzlePattern!, B)).toBeCloseTo(1);
    }
  });

  it('drizzle over the hole is fine (it falls through), but smothering the donut is not', () => {
    const w = new GlazeWork(1, fried, menu, B);
    w.pour('white-icing', -0.8, 0, 0.8, 0);
    expect(w.currentLayer!.spill).toBeLessThan(0.02);
    const smothered = new GlazeWork(1, fried, menu, B);
    zigzag((a, b, c, d) => smothered.pour('white-icing', a, b, c, d), 30, 0.8);
    expect(drizzleQuality(smothered.currentLayer!, B)).toBeLessThan(0.2);
  });

  it('the drizzle is a thin stream (thinner icing, Kumar 2026-10-31)', () => {
    expect(B.brushRadius.drizzle).toBeLessThan(B.brushRadius.dip / 2);
  });

  it('missing the drizzle costs the drizzle share', () => {
    const s = glazeScoreFor(make('strawberry', null), flavor('strawberry'), B);
    expect(s).toBeLessThanOrEqual(1 - B.drizzleWeight + 1e-9);
  });

  it('an unwanted drizzle is penalised; the wrong base glaze is penalised more', () => {
    const plain = glazeScoreFor(make('cookies-and-cream', null), flavor('cookies-and-cream'), B);
    const drizzled = glazeScoreFor(make('cookies-and-cream', 'white-icing'), flavor('cookies-and-cream'), B);
    const wrong = glazeScoreFor(make('strawberry', null), flavor('cookies-and-cream'), B);
    expect(drizzled).toBeCloseTo(plain * B.unwantedDrizzleFactor);
    expect(wrong).toBeLessThan(drizzled);
  });

  it('beignet wants a dusting of powdered sugar', () => {
    expect(glazeScoreFor(make('powdered-sugar', null), flavor('beignet'), B)).toBeGreaterThan(0.8);
  });
});
