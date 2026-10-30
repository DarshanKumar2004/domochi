import { describe, expect, it } from 'vitest';
import { MAX_ASPECT, SAFE_LONG, SAFE_SHORT, gameSizeFor, viewportFor } from '../../src/ui/layout';

describe('gameSizeFor', () => {
  it('portrait 9:16 phone gets exactly the safe size', () => {
    expect(gameSizeFor(1080, 1920)).toEqual({ width: 1080, height: 1920 });
  });

  it('landscape 16:9 monitor gets exactly the safe size', () => {
    expect(gameSizeFor(1920, 1080)).toEqual({ width: 1920, height: 1080 });
  });

  it('tall phone (20:9) extends the long side, short side stays 1080', () => {
    expect(gameSizeFor(412, 915)).toEqual({ width: 1080, height: Math.round(1080 * (915 / 412)) });
  });

  it('phone held sideways is landscape', () => {
    const s = gameSizeFor(915, 412);
    expect(s.width).toBeGreaterThan(s.height);
    expect(s.height).toBe(SAFE_SHORT);
  });

  it('squarish laptop window (16:10) extends the short side, long side stays 1920', () => {
    expect(gameSizeFor(1440, 900)).toEqual({ width: 1920, height: 1200 });
  });

  it('stops growing past MAX_ASPECT', () => {
    expect(gameSizeFor(5120, 1080)).toEqual({ width: Math.round(SAFE_SHORT * MAX_ASPECT), height: SAFE_SHORT });
  });

  it('square window counts as portrait', () => {
    const s = gameSizeFor(800, 800);
    expect(s).toEqual({ width: SAFE_LONG, height: SAFE_LONG });
    expect(viewportFor(s.width, s.height).orientation).toBe('portrait');
  });

  it('falls back to portrait safe size for a zero-size window', () => {
    expect(gameSizeFor(0, 0)).toEqual({ width: SAFE_SHORT, height: SAFE_LONG });
  });

  it.each([
    [412, 915],
    [915, 412],
    [1440, 900],
    [1280, 720],
    [768, 1024],
    [3440, 1440],
  ])('game for %ix%i always contains the safe area', (w, h) => {
    const s = gameSizeFor(w, h);
    const v = viewportFor(s.width, s.height);
    expect(v.safe.x).toBeGreaterThanOrEqual(0);
    expect(v.safe.y).toBeGreaterThanOrEqual(0);
    expect(v.safe.x + v.safe.width).toBeLessThanOrEqual(s.width);
    expect(v.safe.y + v.safe.height).toBeLessThanOrEqual(s.height);
  });
});

describe('viewportFor', () => {
  it('portrait 9:16: tab bar eats the bottom of the safe area', () => {
    const v = viewportFor(1080, 1920);
    expect(v.orientation).toBe('portrait');
    expect(v.safe).toEqual({ x: 0, y: 0, width: 1080, height: 1920 });
    expect(v.content).toEqual({ x: 0, y: 0, width: 1080, height: 1720 });
  });

  it('landscape 16:9', () => {
    const v = viewportFor(1920, 1080);
    expect(v.orientation).toBe('landscape');
    expect(v.content).toEqual({ x: 0, y: 0, width: 1920, height: 920 });
  });

  it('tall phone: safe area is centred and clear of the tab bar', () => {
    const v = viewportFor(1080, 2400);
    expect(v.safe.y).toBe(240);
    expect(v.content.y + v.content.height).toBeLessThanOrEqual(2400 - v.tabBarHeight);
  });
});
