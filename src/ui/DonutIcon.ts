import Phaser from 'phaser';
import type { Menu } from '../systems/menu';
import { ringBallCenters, ringBallRadius } from '../stations/donutGeometry';
import { COLORS } from './theme';

export function hexToNumber(hex: string): number {
  return parseInt(hex.slice(1), 16);
}

/**
 * Draw a small finished donut for a flavor (base glaze, drizzle stripes,
 * topping specks) from menu.json colors.
 */
export function drawDonutIcon(g: Phaser.GameObjects.Graphics, x: number, y: number, ring: number, flavorId: string, menu: Menu): void {
  const flavor = menu.flavors.find((f) => f.id === flavorId);
  const base = menu.glazes.find((gl) => gl.id === flavor?.glaze);
  const drizzle = menu.glazes.find((gl) => gl.id === flavor?.drizzle);
  const r = ringBallRadius(ring, 8, 1.2);
  const balls = ringBallCenters(x, y, ring);
  const outline = Math.max(2, r * 0.18);

  for (const p of balls) {
    g.fillStyle(base ? hexToNumber(base.color) : COLORS.dough);
    g.fillCircle(p.x, p.y, r);
    g.lineStyle(outline, COLORS.ink);
    g.strokeCircle(p.x, p.y, r);
  }

  if (drizzle) {
    g.lineStyle(Math.max(2, r * 0.3), hexToNumber(drizzle.color));
    for (const k of [-1, 0, 1]) {
      g.lineBetween(x - ring * 1.1, y + k * ring * 0.6 - ring * 0.35, x + ring * 1.1, y + k * ring * 0.6 + ring * 0.35);
    }
  }

  const toppings = (flavor?.toppings ?? []).map((id) => menu.toppings.find((t) => t.id === id)).filter((t) => !!t);
  toppings.forEach((t, ti) => {
    balls.forEach((p, i) => {
      for (let j = 0; j < 3; j++) {
        const color = t.colors[(i + j + ti) % t.colors.length]!;
        const a = (i * 2.4 + j * 2.1 + ti) % (Math.PI * 2);
        const d = j === 2 ? 0 : r * 0.5;
        g.fillStyle(hexToNumber(color));
        g.fillRect(p.x + Math.cos(a) * d - r * 0.26, p.y + Math.sin(a) * d - r * 0.15, r * 0.52, r * 0.3);
      }
    });
  });
}

const ICON_RING = 40;
const ICON_SIZE = 128;

/**
 * Texture key for a flavor's icon, drawing it once on first use.
 *
 * Phaser Graphics re-draw every shape every frame, so a rail full of tickets
 * drawn as Graphics costs hundreds of shapes per frame. Baking each flavor
 * into a texture once makes every icon a single cheap image.
 * These are generated cache textures, not art assets, so they're not in keys.ts.
 */
export function donutIconTexture(scene: Phaser.Scene, flavorId: string, menu: Menu): string {
  const key = `donut-icon:${flavorId}`;
  if (!scene.textures.exists(key)) {
    const g = scene.make.graphics({}, false);
    drawDonutIcon(g, ICON_SIZE / 2, ICON_SIZE / 2, ICON_RING, flavorId, menu);
    g.generateTexture(key, ICON_SIZE, ICON_SIZE);
    g.destroy();
  }
  return key;
}

/** An image of a flavor's donut, `size` px across. */
export function addDonutIcon(scene: Phaser.Scene, x: number, y: number, size: number, flavorId: string, menu: Menu): Phaser.GameObjects.Image {
  return new Phaser.GameObjects.Image(scene, x, y, donutIconTexture(scene, flavorId, menu)).setDisplaySize(size, size);
}
