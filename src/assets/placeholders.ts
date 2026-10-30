import Phaser from 'phaser';
import { ringBallCenters, ringBallRadius } from '../stations/donutGeometry';
import { COLORS } from '../ui/theme';
import { AnimKeys, ETHAN_FRAME, TRUCK_SPEC, TextureKeys, type TextureKey } from './keys';

// Code-drawn placeholder art (CLAUDE.md: shapes drawn in code until real art arrives).
// Each placeholder is only generated if no real file was loaded for its key.

type G = Phaser.GameObjects.Graphics;

interface PlaceholderSpec {
  width: number;
  height: number;
  /** Set for sprite sheets: frames are laid out left to right. */
  frameWidth?: number;
  paint: (g: G) => void;
}

const DARK = 0x2b1a10;

function paintTruck(g: G): void {
  // Roof sign (TODO-BRAND: real logo)
  g.fillStyle(COLORS.pink);
  g.fillRoundedRect(250, 0, 400, 90, 24);
  // Body
  g.fillStyle(COLORS.cream);
  g.fillRoundedRect(20, 80, 860, 450, 48);
  g.fillStyle(COLORS.pinkDark);
  g.fillRoundedRect(20, 470, 860, 60, { tl: 0, tr: 0, bl: 48, br: 48 });
  // Service window
  g.fillStyle(0x3a2a1e);
  g.fillRoundedRect(150, 180, 600, 260, 16);
  // Striped awning
  for (let i = 0; i < 10; i++) {
    g.fillStyle(i % 2 === 0 ? COLORS.pink : COLORS.cream);
    g.fillRect(130 + i * 64, 120, 64, 60);
  }
  // Counter
  g.fillStyle(COLORS.brown);
  g.fillRect(130, 440, 640, 26);
  // Wheels
  for (const x of [210, 690]) {
    g.fillStyle(0x222222);
    g.fillCircle(x, 540, 72);
    g.fillStyle(0x9aa3ab);
    g.fillCircle(x, 540, 30);
  }
}

function paintEthan(g: G): void {
  // Waving arm angles per frame, in radians (negative = raised).
  const angles = [-0.35, -0.75, -1.15, -1.55];
  for (let i = 0; i < ETHAN_FRAME.count; i++) {
    const ox = i * ETHAN_FRAME.width;
    const cx = ox + 100;
    const a = angles[i] ?? 0;
    const sx = cx + 50;
    const sy = 180;
    const hx = sx + Math.cos(a) * 55;
    const hy = sy + Math.sin(a) * 55;
    // Cream outline first (logo-style ink outlines, and it keeps his black
    // shirt visible on dark backgrounds), then the shirt on top.
    g.fillStyle(COLORS.cream);
    g.fillRoundedRect(cx - 66, 154, 132, 122, 34);
    g.fillRoundedRect(cx - 86, 164, 42, 92, 18);
    g.lineStyle(40, COLORS.cream);
    g.lineBetween(sx, sy, hx, hy);
    // Body, left arm, apron
    g.fillStyle(COLORS.shirt);
    g.fillRoundedRect(cx - 60, 160, 120, 110, 30);
    g.fillRoundedRect(cx - 80, 170, 30, 80, 14);
    g.fillStyle(COLORS.cream);
    g.fillRoundedRect(cx - 35, 185, 70, 80, 12);
    // Waving arm
    g.lineStyle(28, COLORS.shirt);
    g.lineBetween(sx, sy, hx, hy);
    g.fillStyle(COLORS.skin);
    g.fillCircle(hx, hy, 17);
    // Head
    g.fillCircle(cx, 105, 55);
    // Cap (TODO-BRAND)
    g.fillStyle(COLORS.pink);
    g.fillEllipse(cx, 60, 124, 46);
    g.fillRect(cx, 64, 70, 12);
    // Face
    g.fillStyle(DARK);
    g.fillCircle(cx - 20, 105, 7);
    g.fillCircle(cx + 20, 105, 7);
    g.lineStyle(6, DARK);
    g.beginPath();
    g.arc(cx, 115, 22, 0.35, Math.PI - 0.35);
    g.strokePath();
  }
}

function paintCustomer(g: G): void {
  g.fillStyle(0x4a4a5a);
  g.fillRect(45, 280, 35, 60);
  g.fillRect(100, 280, 35, 60);
  g.fillStyle(0x7fb069);
  g.fillRoundedRect(30, 130, 120, 170, 40);
  g.fillStyle(0xe0ac69);
  g.fillCircle(90, 75, 55);
  g.fillStyle(0x3b2a20);
  g.fillEllipse(90, 38, 112, 50);
  g.fillStyle(DARK);
  g.fillCircle(70, 78, 6);
  g.fillCircle(110, 78, 6);
  g.lineStyle(5, DARK);
  g.beginPath();
  g.arc(90, 88, 18, 0.4, Math.PI - 0.4);
  g.strokePath();
}

function paintDonut(g: G): void {
  const ring = 106;
  const r = ringBallRadius(ring);
  for (const p of ringBallCenters(160, 160, ring)) {
    g.fillStyle(COLORS.dough);
    g.fillCircle(p.x, p.y, r);
    g.lineStyle(6, COLORS.doughEdge);
    g.strokeCircle(p.x, p.y, r);
  }
}

function paintFryer(g: G): void {
  g.fillStyle(0x9aa3ab);
  g.fillRoundedRect(0, 60, 760, 400, 40);
  // Oil vat
  g.fillStyle(0x6d757c);
  g.fillRoundedRect(35, 75, 510, 330, 28);
  g.fillStyle(0xd9a441);
  g.fillRoundedRect(50, 90, 480, 300, 24);
  // Control panel: heat dial + oil gauge
  g.fillStyle(0x5a6168);
  g.fillRoundedRect(570, 100, 160, 300, 20);
  g.fillStyle(0xeeeeee);
  g.fillCircle(650, 190, 55);
  g.lineStyle(10, 0xd04040);
  g.lineBetween(650, 190, 650 + Math.cos(-2.2) * 38, 190 + Math.sin(-2.2) * 38);
  g.fillStyle(0x333333);
  g.fillRoundedRect(610, 280, 80, 100, 10);
  g.fillStyle(0xd9a441);
  g.fillRect(618, 315, 64, 58);
}

function paintGlazeBowl(g: G): void {
  g.fillStyle(0xffffff);
  g.beginPath();
  g.arc(130, 50, 120, 0, Math.PI, false);
  g.closePath();
  g.fillPath();
  g.fillEllipse(130, 50, 240, 70);
  g.fillStyle(COLORS.pink);
  g.fillEllipse(130, 50, 210, 50);
}

function paintToppingJar(g: G): void {
  g.fillStyle(COLORS.pinkDark);
  g.fillRoundedRect(30, 0, 100, 40, 10);
  g.fillStyle(0xdff3fa, 0.9);
  g.fillRoundedRect(15, 35, 130, 180, 30);
  const colors = [COLORS.pink, 0x7fd1ae, 0xffd166, 0x6ec6ff];
  for (let i = 0; i < 24; i++) {
    g.fillStyle(colors[i % colors.length] ?? COLORS.pink);
    g.fillRect(35 + ((i * 37) % 90), 90 + ((i * 53) % 110), 16, 7);
  }
}

function paintDonutBox(g: G): void {
  g.fillStyle(0xc9a273);
  g.fillRect(40, 0, 540, 120);
  g.fillStyle(0xd8b58a);
  g.fillRoundedRect(0, 100, 620, 320, 24);
  g.fillStyle(0xc09a6c);
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) {
      g.fillRoundedRect(35 + col * 190, 130 + row * 140, 170, 120, 20);
    }
  }
}

function paintIconLobby(g: G): void {
  g.fillStyle(COLORS.cream);
  g.fillRoundedRect(6, 24, 66, 46, 8);
  g.fillRoundedRect(70, 40, 20, 30, 6);
  g.fillStyle(COLORS.tabBar);
  g.fillRect(16, 32, 34, 16);
  g.fillStyle(COLORS.cream);
  g.fillCircle(24, 76, 11);
  g.fillCircle(68, 76, 11);
}

function paintIconFry(g: G): void {
  g.fillStyle(COLORS.cream);
  g.fillRoundedRect(14, 42, 68, 44, 10);
  g.fillRect(2, 48, 14, 8);
  g.fillRect(80, 48, 14, 8);
  g.lineStyle(6, COLORS.cream);
  g.lineBetween(34, 10, 34, 32);
  g.lineBetween(48, 6, 48, 32);
  g.lineBetween(62, 10, 62, 32);
}

function paintIconGlaze(g: G): void {
  g.fillStyle(COLORS.cream);
  g.fillCircle(48, 60, 26);
  g.fillTriangle(48, 8, 24, 52, 72, 52);
}

function paintIconToppings(g: G): void {
  const lines: [number, number, number, number][] = [
    [14, 20, 34, 34],
    [56, 14, 78, 22],
    [20, 60, 30, 82],
    [46, 44, 66, 56],
    [70, 66, 84, 86],
    [40, 76, 54, 90],
  ];
  g.lineStyle(10, COLORS.cream);
  for (const [x1, y1, x2, y2] of lines) g.lineBetween(x1, y1, x2, y2);
}

function paintIconBox(g: G): void {
  g.fillStyle(COLORS.cream);
  g.fillRoundedRect(10, 36, 76, 50, 8);
  g.fillRoundedRect(4, 22, 88, 18, 6);
}

const SPECS: Record<TextureKey, PlaceholderSpec> = {
  [TextureKeys.Truck]: { width: TRUCK_SPEC.width, height: TRUCK_SPEC.height, paint: paintTruck },
  [TextureKeys.Ethan]: {
    width: ETHAN_FRAME.width * ETHAN_FRAME.count,
    height: ETHAN_FRAME.height,
    frameWidth: ETHAN_FRAME.width,
    paint: paintEthan,
  },
  [TextureKeys.Customer]: { width: 180, height: 340, paint: paintCustomer },
  [TextureKeys.DonutPlain]: { width: 320, height: 320, paint: paintDonut },
  [TextureKeys.Fryer]: { width: 760, height: 460, paint: paintFryer },
  [TextureKeys.GlazeBowl]: { width: 260, height: 170, paint: paintGlazeBowl },
  [TextureKeys.ToppingJar]: { width: 160, height: 220, paint: paintToppingJar },
  [TextureKeys.DonutBox]: { width: 620, height: 420, paint: paintDonutBox },
  [TextureKeys.IconLobby]: { width: 96, height: 96, paint: paintIconLobby },
  [TextureKeys.IconFry]: { width: 96, height: 96, paint: paintIconFry },
  [TextureKeys.IconGlaze]: { width: 96, height: 96, paint: paintIconGlaze },
  [TextureKeys.IconToppings]: { width: 96, height: 96, paint: paintIconToppings },
  [TextureKeys.IconBox]: { width: 96, height: 96, paint: paintIconBox },
};

const ALL_KEYS = Object.keys(SPECS) as TextureKey[];

/** Generate placeholder textures for any of `keys` that don't exist yet. */
export function ensurePlaceholderTextures(scene: Phaser.Scene, keys: readonly TextureKey[] = ALL_KEYS): void {
  for (const key of keys) {
    if (scene.textures.exists(key)) continue;
    const spec = SPECS[key];
    const g = scene.make.graphics({}, false);
    spec.paint(g);
    g.generateTexture(key, spec.width, spec.height);
    g.destroy();

    if (spec.frameWidth !== undefined) {
      const tex = scene.textures.get(key);
      const count = Math.floor(spec.width / spec.frameWidth);
      for (let i = 0; i < count; i++) {
        tex.add(i, 0, i * spec.frameWidth, 0, spec.frameWidth, spec.height);
      }
    }
  }
}

/** Global animations. Works for both the placeholder and a real sprite sheet. */
export function createAnimations(scene: Phaser.Scene): void {
  if (!scene.anims.exists(AnimKeys.EthanWave)) {
    scene.anims.create({
      key: AnimKeys.EthanWave,
      frames: scene.anims.generateFrameNumbers(TextureKeys.Ethan, { start: 0, end: ETHAN_FRAME.count - 1 }),
      frameRate: 8,
      yoyo: true,
      repeat: -1,
    });
  }
}
