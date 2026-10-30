export interface Point {
  x: number;
  y: number;
}

/** Number of dough balls in a pon de ring mochi donut. */
export const RING_BALL_COUNT = 8;

/**
 * Centers of the dough balls in a pon de ring, evenly spaced on a circle.
 * The first ball sits at the top (12 o'clock) and they go clockwise.
 */
export function ringBallCenters(
  cx: number,
  cy: number,
  ringRadius: number,
  count: number = RING_BALL_COUNT,
): Point[] {
  const points: Point[] = [];
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / count;
    points.push({ x: cx + ringRadius * Math.cos(angle), y: cy + ringRadius * Math.sin(angle) });
  }
  return points;
}

/**
 * Ball radius that makes neighbouring balls just touch, scaled by `overlap`
 * (values above 1 make them overlap so the ring reads as connected).
 */
export function ringBallRadius(ringRadius: number, count: number = RING_BALL_COUNT, overlap = 1.15): number {
  return ringRadius * Math.sin(Math.PI / count) * overlap;
}
