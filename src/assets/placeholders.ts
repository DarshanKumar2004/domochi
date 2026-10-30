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

/**
 * domochi's white trailer, after Kumar's photos: serving window on the left
 * with a menu board, stainless shelf, black OPEN sign, light bar, tandem
 * wheels with white rims. Bold ink outlines echo the logo's comic style.
 * The logo, OPEN text and @handle are added on top by ui/Truck.ts.
 */
function paintTruck(g: G): void {
  const ink = COLORS.ink;
  // Body
  g.fillStyle(0xf7f6f2);
  g.fillRoundedRect(20, 40, 860, 470, 28);
  g.fillStyle(0xdedcd6);
  g.fillRect(28, 48, 844, 22);
  g.lineStyle(8, ink);
  g.strokeRoundedRect(20, 40, 860, 470, 28);
  // Light bar
  g.fillStyle(0xffffff);
  g.fillRect(600, 86, 240, 14);
  g.lineStyle(3, 0xbdbdbd);
  g.strokeRect(600, 86, 240, 14);
  // Serving window: frame, glass, menu board
  g.fillStyle(0xb9bec4);
  g.fillRect(60, 110, 380, 290);
  g.fillStyle(0x2f3438);
  g.fillRect(72, 122, 356, 268);
  g.fillStyle(0xffffff);
  g.fillRect(82, 132, 66, 150);
  g.lineStyle(4, ink);
  for (let y = 160; y < 270; y += 22) g.lineBetween(90, y, 140, y);
  g.lineStyle(6, ink);
  g.strokeRect(60, 110, 380, 290);
  // Stainless shelf and panel under the window
  g.fillStyle(0xd9dcdf);
  g.fillRect(60, 420, 380, 60);
  g.fillStyle(0xc8ccd0);
  g.fillRect(48, 392, 404, 22);
  g.lineStyle(4, ink);
  g.strokeRect(48, 392, 404, 22);
  // OPEN sign (text added by ui/Truck.ts)
  g.fillStyle(ink);
  g.fillEllipse(TRUCK_SPEC.openSignCenter.x, TRUCK_SPEC.openSignCenter.y, 150, 66);
  g.lineStyle(3, 0x777777);
  g.lineBetween(TRUCK_SPEC.openSignCenter.x - 30, 140, TRUCK_SPEC.openSignCenter.x, 120);
  g.lineBetween(TRUCK_SPEC.openSignCenter.x + 30, 140, TRUCK_SPEC.openSignCenter.x, 120);
  // Tandem wheels with white rims
  for (const x of [170, 320]) {
    g.fillStyle(0x222222);
    g.fillCircle(x, 540, 64);
    g.fillStyle(0xf2f2f2);
    g.fillCircle(x, 540, 34);
    g.fillStyle(0x999999);
    g.fillCircle(x, 540, 8);
  }
}

/** Sidewalk A-frame sign: a poster of real domochi flavors (after Kumar's photo). */
function paintAFrame(g: G): void {
  const ink = COLORS.ink;
  // Legs and frame
  g.fillStyle(ink);
  g.fillRect(14, 20, 14, 290);
  g.fillRect(192, 20, 14, 290);
  g.fillRoundedRect(10, 10, 200, 260, 10);
  g.fillStyle(0xf7f6f2);
  g.fillRect(22, 22, 176, 236);
  // Donut photos: beignet, cookie butter, strawberry, cookies & cream, fruity cereal
  const donuts: [number, number, number][] = [
    [62, 70, 0xffffff],
    [148, 70, 0xc68a4e],
    [62, 140, 0xf4a6c0],
    [148, 140, 0xf1ece4],
    [105, 205, 0xff6b8a],
  ];
  for (const [x, y, color] of donuts) {
    g.fillStyle(color);
    g.fillCircle(x, y, 30);
    g.lineStyle(3, 0xcfc8bd);
    g.strokeCircle(x, y, 30);
    g.fillStyle(0xf7f6f2);
    g.fillCircle(x, y, 11);
  }
  // "DOMOCHI MOCHI DONUTS" lettering, as bars
  g.fillStyle(ink);
  g.fillRect(40, 238, 140, 10);
}

/** Fallback if public/assets/logo.png fails to load: the ring of 8 balls, ink on white. */
function paintLogoFallback(g: G): void {
  const ring = 170;
  const r = ringBallRadius(ring, 8, 1.2);
  for (const p of ringBallCenters(256, 230, ring)) {
    g.fillStyle(0xffffff);
    g.fillCircle(p.x, p.y, r);
    g.lineStyle(10, COLORS.ink);
    g.strokeCircle(p.x, p.y, r);
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

interface CustomerLook {
  shirt: number;
  pants: number;
  skin: number;
  hair: number;
  /** Optional extra: backpack straps, tie, etc. */
  extra?: (g: G) => void;
}

const CUSTOMER_LOOKS = {
  // UL Lafayette vermilion hoodie with backpack straps.
  student: {
    shirt: 0xce181e,
    pants: 0x3b4a6b,
    skin: 0xc68642,
    hair: 0x1b1210,
    extra: (g: G) => {
      g.fillStyle(0x2b2b2b);
      g.fillRect(44, 140, 14, 120);
      g.fillRect(122, 140, 14, 120);
    },
  },
  office: {
    shirt: 0x4a6fa5,
    pants: 0x2f3440,
    skin: 0xf1c27d,
    hair: 0x6b4423,
    extra: (g: G) => {
      g.fillStyle(0x1f1a17);
      g.fillTriangle(82, 135, 98, 135, 90, 215);
    },
  },
  parent: { shirt: 0x8e6bbf, pants: 0x4a4a5a, skin: 0xe0ac69, hair: 0x3b2a20 },
  // Regulars wear the domochi tee.
  regular: {
    shirt: 0x1f1a17,
    pants: 0x6b6f73,
    skin: 0x8d5524,
    hair: 0x0f0f0f,
    extra: (g: G) => {
      g.fillStyle(0xffffff);
      g.fillCircle(90, 190, 18);
      g.fillStyle(0x1f1a17);
      g.fillCircle(90, 190, 8);
    },
  },
} satisfies Record<string, CustomerLook>;

function paintCustomer(look: CustomerLook): (g: G) => void {
  return (g) => {
    g.fillStyle(look.pants);
    g.fillRect(45, 280, 35, 60);
    g.fillRect(100, 280, 35, 60);
    g.fillStyle(look.shirt);
    g.fillRoundedRect(30, 130, 120, 170, 40);
    look.extra?.(g);
    g.fillStyle(look.skin);
    g.fillCircle(90, 75, 55);
    g.fillStyle(look.hair);
    g.fillEllipse(90, 38, 112, 50);
    paintFace(g);
  };
}

function paintFace(g: G): void {
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

/** Fryer vat seen from the front-top. The oil surface is the area donuts float in (see FRYER_SPEC). */
function paintFryer(g: G): void {
  const ink = COLORS.ink;
  g.fillStyle(0xaab2ba);
  g.fillRoundedRect(10, 10, 740, 420, 36);
  g.lineStyle(8, ink);
  g.strokeRoundedRect(10, 10, 740, 420, 36);
  // Oil
  g.fillStyle(0x6d757c);
  g.fillRoundedRect(44, 44, 672, 352, 24);
  g.fillStyle(0xd9a441);
  g.fillRoundedRect(56, 56, 648, 328, 20);
  g.fillStyle(0xe8bb5e, 0.6);
  for (let i = 0; i < 5; i++) g.fillEllipse(140 + i * 120, 90 + (i % 2) * 230, 90, 18);
  g.lineStyle(5, ink);
  g.strokeRoundedRect(44, 44, 672, 352, 24);
}

/** Pressing grate: steel bars with a handle, laid over the oil. */
function paintFryGrate(g: G): void {
  const ink = COLORS.ink;
  g.lineStyle(10, 0x9aa3ab);
  for (let x = 40; x <= 640; x += 75) g.lineBetween(x, 30, x, 330);
  for (let y = 30; y <= 330; y += 100) g.lineBetween(30, y, 650, y);
  g.lineStyle(4, ink, 0.6);
  g.strokeRoundedRect(25, 25, 630, 310, 16);
  // Handle
  g.fillStyle(0x5a6168);
  g.fillRoundedRect(620, 150, 60, 60, 12);
}

/** Mochi donut depositor: a hopper of dough that drops rings into the oil from its nozzle (bottom centre). */
function paintFryDispenser(g: G): void {
  const ink = COLORS.ink;
  // Hopper
  g.fillStyle(0xc9ced3);
  g.fillPoints([new Phaser.Math.Vector2(20, 20), new Phaser.Math.Vector2(180, 20), new Phaser.Math.Vector2(130, 130), new Phaser.Math.Vector2(70, 130)], true);
  g.lineStyle(6, ink);
  g.strokePoints([new Phaser.Math.Vector2(20, 20), new Phaser.Math.Vector2(180, 20), new Phaser.Math.Vector2(130, 130), new Phaser.Math.Vector2(70, 130)], true);
  // Dough visible at the top
  g.fillStyle(0xf4ead2);
  g.fillEllipse(100, 26, 150, 22);
  // Nozzle
  g.fillStyle(0x8a9097);
  g.fillRect(82, 130, 36, 40);
  g.lineStyle(5, ink);
  g.strokeRect(82, 130, 36, 40);
  // Crank
  g.lineStyle(8, ink);
  g.lineBetween(180, 60, 200, 60);
  g.fillStyle(COLORS.pink);
  g.fillCircle(200, 60, 12);
}

/** Plain white pon de ring, tinted at runtime by doneness (see fryColor). */
function paintDonutFry(g: G): void {
  const ring = 52;
  const r = ringBallRadius(ring, 8, 1.15);
  for (const p of ringBallCenters(80, 80, ring)) {
    g.fillStyle(0xffffff);
    g.fillCircle(p.x, p.y, r);
    g.lineStyle(4, 0x8a8a8a);
    g.strokeCircle(p.x, p.y, r);
  }
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
  [TextureKeys.Logo]: { width: 512, height: 512, paint: paintLogoFallback },
  [TextureKeys.Truck]: { width: TRUCK_SPEC.width, height: TRUCK_SPEC.height, paint: paintTruck },
  [TextureKeys.SignAFrame]: { width: 220, height: 320, paint: paintAFrame },
  [TextureKeys.Ethan]: {
    width: ETHAN_FRAME.width * ETHAN_FRAME.count,
    height: ETHAN_FRAME.height,
    frameWidth: ETHAN_FRAME.width,
    paint: paintEthan,
  },
  [TextureKeys.CustomerStudent]: { width: 180, height: 340, paint: paintCustomer(CUSTOMER_LOOKS.student) },
  [TextureKeys.CustomerOffice]: { width: 180, height: 340, paint: paintCustomer(CUSTOMER_LOOKS.office) },
  [TextureKeys.CustomerParent]: { width: 180, height: 340, paint: paintCustomer(CUSTOMER_LOOKS.parent) },
  [TextureKeys.CustomerRegular]: { width: 180, height: 340, paint: paintCustomer(CUSTOMER_LOOKS.regular) },
  [TextureKeys.DonutPlain]: { width: 320, height: 320, paint: paintDonut },
  [TextureKeys.Fryer]: { width: 760, height: 440, paint: paintFryer },
  [TextureKeys.FryGrate]: { width: 690, height: 360, paint: paintFryGrate },
  [TextureKeys.FryDispenser]: { width: 215, height: 175, paint: paintFryDispenser },
  [TextureKeys.DonutFry]: { width: 160, height: 160, paint: paintDonutFry },
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
