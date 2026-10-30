import { describe, expect, it } from 'vitest';
import { RING_BALL_COUNT, ringBallCenters, ringBallRadius } from '../../src/stations/donutGeometry';

describe('ringBallCenters', () => {
  it('returns 8 balls by default', () => {
    expect(ringBallCenters(0, 0, 100)).toHaveLength(RING_BALL_COUNT);
  });

  it('starts at 12 o clock and keeps every ball on the ring', () => {
    const pts = ringBallCenters(50, 50, 100);
    expect(pts[0]!.x).toBeCloseTo(50);
    expect(pts[0]!.y).toBeCloseTo(-50);
    for (const p of pts) {
      expect(Math.hypot(p.x - 50, p.y - 50)).toBeCloseTo(100);
    }
  });
});

describe('ringBallRadius', () => {
  it('makes neighbouring balls touch when overlap is 1', () => {
    const [a, b] = ringBallCenters(0, 0, 100);
    const r = ringBallRadius(100, RING_BALL_COUNT, 1);
    expect(Math.hypot(a!.x - b!.x, a!.y - b!.y)).toBeCloseTo(2 * r);
  });
});
