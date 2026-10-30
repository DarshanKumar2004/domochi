// Drawing finished donuts (fried ring, glaze layers, toppings) onto 2D canvases,
// shared by the Glaze, Toppings and Box stations. Everything is drawn from the
// donut's data, so a redraw always matches what was made.
import Phaser from 'phaser';
import { ringBallCenters, ringBallRadius } from '../stations/donutGeometry';
import { fryColor, type FriedDonut } from '../stations/fry';
import type { GlazeLayer } from '../stations/glaze';
import type { FinishedDonut, ToppingPiece } from '../stations/toppings';
import type { Topping } from '../systems/menu';
import { balance, menu, session } from '../systems/services';

/** Reference canvas size: detail sizes (speckles, crumbs) are tuned at this size and scale with it. */
export const ART_SIZE = 420;
/** Shelf / box icon size. */
const ICON = 128;

export function fryTint(d: FriedDonut): number {
  return fryColor((d.a + d.b) / 2);
}

function css(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}

/** Small deterministic random sequence (same seed, same detail every redraw). */
function seeded(seed: number): () => number {
  let s = (Math.abs(Math.floor(seed)) * 9301 + 49297) % 233280;
  return () => (s = (s * 9301 + 49297) % 233280) / 233280;
}

/** One poured glaze segment in its style (with its speckles). */
export function drawGlazeSegment(ctx: CanvasRenderingContext2D, size: number, glazeId: string, x0: number, y0: number, x1: number, y1: number, seed: number): void {
  const g = menu.glazes.find((x) => x.id === glazeId);
  if (!g) return;
  const half = size / 2;
  const k = size / ART_SIZE;
  const r = balance.glaze.brushRadius[g.style] * half;
  const px = (v: number) => (v + 1) * half;
  const rnd = seeded(seed);
  const len = Math.hypot(x1 - x0, y1 - y0) * half;

  if (g.style === 'dust') {
    const steps = Math.max(1, Math.ceil(len / (r * 0.5)));
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const cx = px(x0 + (x1 - x0) * t);
      const cy = px(y0 + (y1 - y0) * t);
      for (let n = 0; n < 12; n++) {
        const a = rnd() * Math.PI * 2;
        const dist = Math.sqrt(rnd()) * r;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * dist, cy + Math.sin(a) * dist, (1.5 + rnd() * 2.5) * k, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    return;
  }

  ctx.strokeStyle = g.color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = r * 2;
  ctx.beginPath();
  ctx.moveTo(px(x0), px(y0));
  ctx.lineTo(px(x1) + 0.01, px(y1));
  ctx.stroke();

  // Detail flecks: strawberry seeds, cookie crumbs, nut bits…
  if (g.speckles) {
    const count = Math.round(g.speckles.density * (len / r + 1) * 5);
    for (let n = 0; n < count; n++) {
      const t = rnd();
      const a = rnd() * Math.PI * 2;
      const dist = Math.sqrt(rnd()) * r * 0.85;
      ctx.fillStyle = g.speckles.colors[Math.floor(rnd() * g.speckles.colors.length)]!;
      ctx.beginPath();
      ctx.ellipse(
        px(x0 + (x1 - x0) * t) + Math.cos(a) * dist,
        px(y0 + (y1 - y0) * t) + Math.sin(a) * dist,
        (2 + rnd() * 3) * k,
        (1.2 + rnd() * 1.6) * k,
        rnd() * Math.PI,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }
}

export function drawGlazeLayers(ctx: CanvasRenderingContext2D, size: number, layers: readonly GlazeLayer[]): void {
  for (const layer of layers) {
    for (let k = 0; k < layer.segments.length; k += 4) {
      drawGlazeSegment(ctx, size, layer.glazeId, layer.segments[k]!, layer.segments[k + 1]!, layer.segments[k + 2]!, layer.segments[k + 3]!, k + 4);
    }
  }
}

/** One topping piece (crumb, cereal loop or whole cookie) at its spot. */
export function drawToppingPiece(ctx: CanvasRenderingContext2D, size: number, p: ToppingPiece, t: Topping): void {
  const half = size / 2;
  const cx = (p.x + 1) * half;
  const cy = (p.y + 1) * half;
  const r = t.size * half;
  const rnd = seeded((p.x + 2) * 7919 + (p.y + 2) * 104729);
  const color = t.colors[Math.floor(rnd() * t.colors.length)]!;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(p.rot);
  ctx.lineWidth = Math.max(1, size / ART_SIZE * 2);
  ctx.strokeStyle = 'rgba(31,26,23,0.55)';
  switch (t.shape) {
    case 'crumb': {
      // A jagged little chunk.
      ctx.fillStyle = color;
      ctx.beginPath();
      const pts = 5 + Math.floor(rnd() * 3);
      for (let i = 0; i < pts; i++) {
        const a = (i / pts) * Math.PI * 2;
        const d = r * (0.6 + rnd() * 0.5);
        if (i === 0) ctx.moveTo(Math.cos(a) * d, Math.sin(a) * d);
        else ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d);
      }
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'loop': {
      // A fruity cereal ring.
      ctx.strokeStyle = color;
      ctx.lineWidth = r * 0.65;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.68, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'biscuit': {
      // A whole cookie: scalloped rounded rectangle with a stamped pattern.
      const w = r * 1.6;
      const h = r * 1.05;
      ctx.fillStyle = t.colors[0]!;
      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, w, h, r * 0.18);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = t.colors[1] ?? t.colors[0]!;
      const bumps = 7;
      for (let i = 0; i < bumps; i++) {
        const x = -w / 2 + (w * (i + 0.5)) / bumps;
        ctx.beginPath();
        ctx.arc(x, -h / 2 + r * 0.14, r * 0.07, 0, Math.PI * 2);
        ctx.arc(x, h / 2 - r * 0.14, r * 0.07, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = t.colors[1] ?? 'rgba(0,0,0,0.3)';
      ctx.lineWidth = Math.max(1, r * 0.06);
      ctx.strokeRect(-w / 2 + r * 0.3, -h / 2 + r * 0.3, w - r * 0.6, h - r * 0.6);
      break;
    }
  }
  ctx.restore();
}

export function drawToppings(ctx: CanvasRenderingContext2D, size: number, pieces: readonly ToppingPiece[]): void {
  for (const p of pieces) {
    if (!p.on) continue;
    const t = menu.toppings.find((x) => x.id === p.toppingId);
    if (t) drawToppingPiece(ctx, size, p, t);
  }
}

/** The 8 fried balls, glaze and ball outlines (everything but the toppings). */
export function drawDonutBase(ctx: CanvasRenderingContext2D, size: number, d: { fry: FriedDonut; layers: readonly GlazeLayer[] }): void {
  const gb = balance.glaze;
  const half = size / 2;
  const r = ringBallRadius(gb.ringRadius, 8, gb.ballOverlap) * half;
  const balls = ringBallCenters(half, half, gb.ringRadius * half);
  ctx.fillStyle = css(fryTint(d.fry));
  for (const p of balls) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  drawGlazeLayers(ctx, size, d.layers);
  ctx.strokeStyle = 'rgba(31,26,23,0.5)';
  ctx.lineWidth = Math.max(2, (size / ART_SIZE) * 5);
  for (const p of balls) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = Math.max(2, (size / ART_SIZE) * 8);
  for (const p of balls) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 0.62, Math.PI * 1.08, Math.PI * 1.42);
    ctx.stroke();
  }
}

export function drawFinishedDonut(ctx: CanvasRenderingContext2D, size: number, d: FinishedDonut): void {
  drawDonutBase(ctx, size, d);
  drawToppings(ctx, size, d.toppings ?? []);
}

const iconVersions = new Map<string, string>();
/** When each icon's donut was last seen gone (ms). */
const goneSince = new Map<string, number>();
/** Icons of donuts that are gone are kept this long, for any ghost still flying to the trash or a customer. */
const KEEP_GONE_MS = 3000;

function versionOf(d: FinishedDonut): string {
  let segs = 0;
  for (const l of d.layers) segs += l.segments.length;
  return `${d.layers.length}:${segs}:${d.toppings?.length ?? 0}`;
}

/** Texture key of a small picture of a finished donut, made (or redrawn) as needed. */
export function donutIcon(scene: Phaser.Scene, d: FinishedDonut): string {
  const key = `donut-art-${d.id}`;
  const version = versionOf(d);
  let tex = scene.textures.exists(key) ? (scene.textures.get(key) as Phaser.Textures.CanvasTexture) : null;
  if (tex && iconVersions.get(key) === version) return key;
  if (!tex) tex = scene.textures.createCanvas(key, ICON, ICON)!;
  tex.context.clearRect(0, 0, ICON, ICON);
  drawFinishedDonut(tex.context, ICON, d);
  tex.refresh();
  iconVersions.set(key, version);
  return key;
}

/**
 * Drop icons of donuts that have been gone (served or trashed) for a few
 * seconds. Station images showing them were hidden or re-pointed when the
 * donut left, and fly-away ghosts are done by then.
 */
export function pruneDonutIcons(scene: Phaser.Scene): void {
  const s = session();
  const live = new Set<string>();
  for (const d of s.shelf) live.add(`donut-art-${d.id}`);
  for (const d of s.box) if (d) live.add(`donut-art-${d.id}`);
  if (s.toppingWork) live.add(`donut-art-${s.toppingWork.donut.id}`);
  const now = performance.now();
  for (const key of iconVersions.keys()) {
    if (live.has(key)) {
      goneSince.delete(key);
      continue;
    }
    const since = goneSince.get(key);
    if (since === undefined) {
      goneSince.set(key, now);
      continue;
    }
    if (now - since < KEEP_GONE_MS) continue;
    if (scene.textures.exists(key)) scene.textures.remove(key);
    iconVersions.delete(key);
    goneSince.delete(key);
  }
}
