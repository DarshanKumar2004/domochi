import Phaser from 'phaser';
import type { Kolache } from '../stations/kolache';
import type { Onigiri } from '../stations/onigiri';
import { fryColor } from '../stations/fry';
import type { SideKind, SideMenu } from '../stations/sides';
import type { Menu } from '../systems/menu';
import { COLORS } from './theme';

// Kolaches and onigiri drawn in code from their state (placeholders until
// real art: the shapes follow what's been done to them, so they stay code).

type G = Phaser.GameObjects.Graphics;

const hex = (c: string) => parseInt(c.slice(1), 16);
const GOLDEN = 2.39996;

/** Steady piece positions on a disc (a sunflower spiral), radius 0–1. */
function spiral(i: number, n: number): { x: number; y: number } {
  const r = Math.sqrt((i + 0.5) / Math.max(n, 1));
  const a = i * GOLDEN;
  return { x: Math.cos(a) * r, y: Math.sin(a) * r };
}

function dots(g: G, x: number, y: number, r: number, counts: Readonly<Record<string, number>>, m: SideMenu | undefined, size: number): void {
  if (!m) return;
  let k = 0;
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  for (const [id, n] of Object.entries(counts)) {
    const t = m.toppings.find((x) => x.id === id);
    if (!t) continue;
    for (let i = 0; i < Math.min(n, 30); i++, k++) {
      const p = spiral(k, Math.min(total, 30));
      g.fillStyle(hex(t.colors[i % t.colors.length]!));
      g.fillCircle(x + p.x * r, y + p.y * r * 0.8, size);
    }
  }
}

/**
 * A kolache at (x, y), about r across its half-width. Raw dough is pale and
 * grows as it proofs; baking browns it. Savory (wrap) ones are an oblong
 * roll with the filling peeking out the ends; sweet (well) ones are round
 * with the filling in the middle.
 */
export function drawKolache(g: G, x: number, y: number, r: number, k: Kolache, m: SideMenu | undefined): void {
  const f = k.filling ? m?.fillings.find((x) => x.id === k.filling) : undefined;
  const rise = 0.72 + 0.28 * Math.min(k.proof, 1.5) - (k.proof > 1.6 ? 0.1 : 0);
  const rr = r * rise;
  const dough = k.baked > 0 ? fryColor(Math.max(0.15, k.baked)) : 0xf6e3c0;
  g.fillStyle(0x000000, 0.18);
  g.fillEllipse(x + 4, y + rr * 0.55, rr * 2, rr * 0.6);
  const wrapped = f?.style === 'wrap' && k.shape >= 0.5;
  if (f?.style === 'wrap') {
    if (!wrapped) {
      // Flat dough with the filling laid on top, not folded yet.
      g.fillStyle(dough);
      g.fillCircle(x, y, rr);
      g.lineStyle(4, COLORS.ink, 0.8);
      g.strokeCircle(x, y, rr);
      if (k.fill > 0) {
        g.fillStyle(hex(f.color));
        const len = rr * Math.min(1.6, 0.6 + k.fill * 0.7);
        g.fillRoundedRect(x - len / 2, y - rr * 0.18, len, rr * 0.36, rr * 0.16);
        if (f.accent) {
          g.fillStyle(hex(f.accent));
          g.fillRect(x - len / 2.6, y - rr * 0.05, len / 1.3, rr * 0.1);
        }
      }
    } else {
      const w = rr * 2.1;
      const h = rr * 1.25;
      if (k.fill > 0) {
        g.fillStyle(hex(f.color));
        g.fillEllipse(x - w / 2, y, rr * 0.4, rr * 0.36);
        g.fillEllipse(x + w / 2, y, rr * 0.4, rr * 0.36);
      }
      g.fillStyle(dough);
      g.fillEllipse(x, y, w * 0.92, h);
      g.lineStyle(4, COLORS.ink, 0.8);
      g.strokeEllipse(x, y, w * 0.92, h);
      // The pinched seam: tighter the more it's been pinched.
      g.lineStyle(3, Phaser.Display.Color.IntegerToColor(dough).darken(25).color, 1);
      const n = Math.min(6, 2 + Math.round(k.shape * 3));
      for (let i = 0; i < n; i++) {
        const sx = x - w * 0.32 + (w * 0.64 * i) / Math.max(1, n - 1);
        g.lineBetween(sx - 6, y - 8, sx + 6, y + 8);
      }
    }
  } else {
    g.fillStyle(dough);
    g.fillCircle(x, y, rr);
    g.lineStyle(4, COLORS.ink, 0.8);
    g.strokeCircle(x, y, rr);
    if (f || k.shape > 0) {
      // The pressed well: wider the deeper it's pressed.
      const well = rr * Math.min(0.68, 0.25 + k.shape * 0.3);
      g.fillStyle(Phaser.Display.Color.IntegerToColor(dough).darken(12).color);
      g.fillCircle(x, y, well);
      if (f && k.fill > 0) {
        g.fillStyle(hex(f.color));
        g.fillCircle(x, y, Math.min(rr * 0.9, well * Math.min(1.35, 0.4 + k.fill * 0.6)));
        if (f.accent) {
          g.fillStyle(hex(f.accent));
          g.fillCircle(x + well * 0.15, y - well * 0.1, well * 0.45 * Math.min(1, k.fill));
        }
      }
    }
  }
  dots(g, x, y, rr * 0.8, k.toppings, m, Math.max(3, r * 0.07));
  if (k.wash > 0) {
    // Egg wash shine.
    g.fillStyle(0xffffff, Math.min(0.45, k.wash * 0.3));
    g.fillEllipse(x - rr * 0.35, y - rr * 0.4, rr * 0.7, rr * 0.3);
  }
}

/**
 * An onigiri at (x, y), r its half-width: a mound of rice that turns into a
 * triangle as it's pressed, the filling where it was put, and the nori band.
 */
export function drawOnigiri(g: G, x: number, y: number, r: number, o: Onigiri, m: SideMenu | undefined, pressCount = 3): void {
  const size = r * (0.55 + 0.3 * Math.min(o.rice, 1.6));
  const t = Math.min(1, o.presses.length / pressCount);
  const rice = 0xfbfaf4;
  g.fillStyle(0x000000, 0.18);
  g.fillEllipse(x + 4, y + size * 0.8, size * 2, size * 0.45);
  // Mound (circle) blending into a rounded triangle.
  const pts: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2 - Math.PI / 2;
    const circle = { x: Math.cos(a), y: Math.sin(a) * 0.92 };
    // A triangle's edge at this angle (apex up).
    const k = Math.cos(Math.PI / 3) / Math.cos(((a + Math.PI / 2) % ((Math.PI * 2) / 3)) - Math.PI / 3);
    const tri = { x: Math.cos(a) * k * 1.12, y: Math.sin(a) * k * 1.12 + 0.12 };
    pts.push(new Phaser.Math.Vector2(x + (circle.x + (tri.x - circle.x) * t) * size, y + (circle.y + (tri.y - circle.y) * t) * size));
  }
  g.fillStyle(rice);
  g.fillPoints(pts, true);
  g.lineStyle(4, COLORS.ink, 0.8);
  g.strokePoints(pts, true);
  // A few grains.
  g.fillStyle(0xe9e4d6);
  for (let i = 0; i < 10; i++) {
    const p = spiral(i, 10);
    g.fillEllipse(x + p.x * size * 0.7, y + p.y * size * 0.6, 7, 4);
  }
  const f = o.filling ? m?.fillings.find((x) => x.id === o.filling) : undefined;
  if (f) {
    const fx = x + o.fillOffset * size * 0.7;
    const fy = y - size * 0.05 - o.fillOffset * size * 0.15;
    g.fillStyle(hex(f.color));
    g.fillCircle(fx, fy, size * 0.22);
    if (f.accent) {
      g.fillStyle(hex(f.accent));
      g.fillCircle(fx - size * 0.06, fy - size * 0.05, size * 0.08);
    }
  }
  dots(g, x, y - size * 0.15, size * 0.55, o.toppings, m, Math.max(2.5, r * 0.05));
  if (o.nori !== null) {
    const nx = x + (o.nori - 0) * size * 0.9 * (o.id % 2 ? 1 : -1);
    g.fillStyle(0x1f2a1c);
    g.fillRect(nx - size * 0.38, y + size * 0.15, size * 0.76, size * 0.92 - size * 0.12);
    g.fillStyle(0x34452e);
    g.fillRect(nx - size * 0.3, y + size * 0.22, size * 0.08, size * 0.6);
  }
}

/** A well-made item of the menu (for tickets and the store). */
function idealOf(kind: SideKind, itemId: string, menu: Menu): Kolache | Onigiri | null {
  const m = menu.sides?.[kind];
  const item = m?.items.find((i) => i.id === itemId);
  if (!m || !item) return null;
  const toppings: Record<string, number> = {};
  for (const t of item.toppings) toppings[t] = m.toppings.find((x) => x.id === t)?.amount.min ?? 3;
  if (kind === 'kolache') return { id: 0, filling: item.filling, fill: 1, shape: 1, wash: 1, proof: 1, toppings, baked: 1, bakeSec: 1, inRangeSec: 1 };
  return { id: 0, rice: 1, quality: 1, filling: item.filling, fillOffset: 0, presses: [0.4, 0.4, 0.4], toppings, nori: 0 };
}

/** Draw a menu item's look into `g` (centred at x, y, `size` across). */
export function drawSideItem(g: G, x: number, y: number, size: number, kind: SideKind, itemId: string, menu: Menu): void {
  const ideal = idealOf(kind, itemId, menu);
  if (!ideal) return;
  if (kind === 'kolache') drawKolache(g, x, y, size * 0.42, ideal as Kolache, menu.sides?.kolache);
  else drawOnigiri(g, x, y - size * 0.06, size * 0.42, ideal as Onigiri, menu.sides?.onigiri);
}

/** A small picture of a menu item (a Graphics, not on the display list until added). */
export function makeSideIcon(scene: Phaser.Scene, x: number, y: number, size: number, kind: SideKind, itemId: string, menu: Menu): G {
  const g = scene.make.graphics({}, false);
  drawSideItem(g, x, y, size, kind, itemId, menu);
  return g;
}

/** Draw any kolache or onigiri (by kind). */
export function drawSide(g: G, kind: SideKind, x: number, y: number, r: number, item: Kolache | Onigiri, m: SideMenu | undefined, pressCount = 3): void {
  if (kind === 'kolache') drawKolache(g, x, y, r, item as Kolache, m);
  else drawOnigiri(g, x, y, r, item as Onigiri, m, pressCount);
}
