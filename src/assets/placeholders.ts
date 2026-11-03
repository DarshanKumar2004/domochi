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
  // The OPEN sign's hanging wires (the sign itself is drawn by ui/Truck.ts, so it can flip)
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
  // Stabiliser jack at the back corner, so the trailer stands level
  g.fillStyle(0x55595e);
  g.fillRect(776, 506, 26, 86);
  g.fillStyle(0x7d8288);
  g.fillRect(770, 506, 38, 22);
  g.fillRect(806, 512, 30, 8); // crank
  g.fillStyle(0x3c3f43);
  g.fillRoundedRect(754, 588, 70, 16, 4); // foot pad
  g.lineStyle(4, ink);
  g.strokeRect(776, 506, 26, 86);
  g.strokeRoundedRect(754, 588, 70, 16, 4);
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

/** A little domochi ring (8 balls), for the cap and the apron pocket. */
function miniRing(g: G, x: number, y: number, ring: number, fill: number): void {
  const r = ringBallRadius(ring, 8, 1.25);
  for (const p of ringBallCenters(x, y, ring)) {
    g.fillStyle(fill);
    g.fillCircle(p.x, p.y, r);
    g.lineStyle(2, COLORS.ink);
    g.strokeCircle(p.x, p.y, r);
  }
}

/**
 * Ethan, torso up, waving: comic style like the logo (bold ink outlines),
 * in a black tee and cream apron with the domochi ring on his pink cap
 * (TODO-BRAND: his real look). A cream halo keeps him readable in the dark
 * serving window.
 */
function paintEthan(g: G): void {
  const ink = COLORS.ink;
  const hair = 0x2a1d17;
  const capDark = 0xd77a9a;
  // Waving arm angles per frame, in radians (negative = raised).
  const angles = [-0.45, -0.85, -1.2, -1.5];
  for (let i = 0; i < ETHAN_FRAME.count; i++) {
    const ox = i * ETHAN_FRAME.width;
    const cx = ox + 96;
    const a = angles[i] ?? 0;
    const sx = cx + 46;
    const sy = 186;
    const ex = sx + Math.cos(a) * 30; // elbow (the sleeve ends here)
    const ey = sy + Math.sin(a) * 34;
    const hx = sx + Math.cos(a) * 56;
    const hy = sy + Math.sin(a) * 56;

    // Cream halo behind everything.
    g.fillStyle(COLORS.cream);
    g.fillRoundedRect(cx - 70, 158, 140, 120, 38);
    g.fillRoundedRect(cx - 92, 166, 46, 98, 20);
    g.fillCircle(cx, 100, 60);
    g.fillEllipse(cx, 62, 130, 70);
    g.fillEllipse(cx, 80, 138, 38);
    g.lineStyle(44, COLORS.cream);
    g.lineBetween(sx, sy, hx, hy);
    g.fillCircle(hx, hy, 28);

    // Body: black tee, rounded shoulders.
    g.fillStyle(COLORS.shirt);
    g.fillRoundedRect(cx - 62, 164, 124, 120, 34);
    // Left arm, resting.
    g.fillRoundedRect(cx - 86, 172, 32, 76, 16);
    g.fillStyle(COLORS.skin);
    g.fillCircle(cx - 70, 252, 14);
    g.lineStyle(3, ink);
    g.strokeCircle(cx - 70, 252, 14);
    // Apron: cream bib with straps and a pocket with the ring.
    g.lineStyle(5, COLORS.cream);
    g.lineBetween(cx - 34, 192, cx - 46, 168);
    g.lineBetween(cx + 34, 192, cx + 46, 168);
    g.fillStyle(COLORS.cream);
    g.fillRoundedRect(cx - 38, 188, 76, 96, 14);
    g.lineStyle(3, ink);
    g.strokeRoundedRect(cx - 38, 188, 76, 96, 14);
    g.fillStyle(0xf3ead9);
    g.fillRoundedRect(cx - 24, 214, 48, 34, 8);
    g.strokeRoundedRect(cx - 24, 214, 48, 34, 8);
    miniRing(g, cx, 231, 9, COLORS.pink);

    // Neck, ears, head.
    g.fillStyle(COLORS.skin);
    g.fillRoundedRect(cx - 15, 140, 30, 32, 10);
    g.fillCircle(cx - 51, 106, 11);
    g.fillCircle(cx + 51, 106, 11);
    g.lineStyle(4, ink);
    g.strokeCircle(cx - 51, 106, 11);
    g.strokeCircle(cx + 51, 106, 11);
    g.fillStyle(COLORS.skin);
    g.fillCircle(cx, 102, 52);
    g.lineStyle(5, ink);
    g.strokeCircle(cx, 102, 52);
    // Hair peeking out under the cap.
    g.fillStyle(hair);
    g.fillEllipse(cx - 40, 82, 26, 30);
    g.fillEllipse(cx + 40, 82, 26, 30);
    // Cap: pink crown, darker brim to the side, the ring on the front.
    g.fillStyle(COLORS.pink);
    g.fillEllipse(cx, 62, 116, 58);
    g.lineStyle(4, ink);
    g.strokeEllipse(cx, 62, 116, 58);
    g.fillStyle(capDark);
    g.fillEllipse(cx, 80, 124, 24);
    g.strokeEllipse(cx, 80, 124, 24);
    miniRing(g, cx - 10, 54, 10, 0xffffff);

    // Face: brows, eyes with a shine, rosy cheeks, a big open smile.
    g.lineStyle(5, hair);
    g.lineBetween(cx - 28, 92, cx - 12, 89);
    g.lineBetween(cx + 12, 89, cx + 28, 92);
    g.fillStyle(ink);
    g.fillEllipse(cx - 19, 106, 12, 15);
    g.fillEllipse(cx + 19, 106, 12, 15);
    g.fillStyle(0xffffff);
    g.fillCircle(cx - 17, 102, 3);
    g.fillCircle(cx + 21, 102, 3);
    g.fillStyle(0xf28aa6, 0.45);
    g.fillCircle(cx - 33, 120, 9);
    g.fillCircle(cx + 33, 120, 9);
    g.fillStyle(0x5a2320);
    g.slice(cx, 120, 19, 0, Math.PI, false);
    g.fillPath();
    g.fillStyle(0xffffff);
    g.fillRect(cx - 14, 120, 28, 5);
    g.fillStyle(0xf28aa6);
    g.fillEllipse(cx, 134, 16, 7);
    g.lineStyle(3, ink);
    g.beginPath();
    g.arc(cx, 120, 19, 0, Math.PI, false);
    g.closePath();
    g.strokePath();

    // Waving arm: a black sleeve to the elbow, then the forearm and an open hand.
    g.lineStyle(30, COLORS.shirt);
    g.lineBetween(sx, sy, ex, ey);
    g.lineStyle(20, COLORS.skin);
    g.lineBetween(ex, ey, hx, hy);
    const fa = a - Math.PI / 2; // fingers fan out along the arm's direction
    for (let k = -1.5; k <= 1.5; k++) {
      const ang = a + k * 0.32;
      const fx = hx + Math.cos(ang) * 17;
      const fy = hy + Math.sin(ang) * 17;
      g.fillStyle(COLORS.skin);
      g.fillCircle(fx, fy, 6);
      g.lineStyle(2.5, ink);
      g.strokeCircle(fx, fy, 6);
    }
    g.fillStyle(COLORS.skin);
    g.fillCircle(hx + Math.cos(fa) * 14, hy + Math.sin(fa) * 14, 6);
    g.lineStyle(2.5, ink);
    g.strokeCircle(hx + Math.cos(fa) * 14, hy + Math.sin(fa) * 14, 6);
    g.fillStyle(COLORS.skin);
    g.fillCircle(hx, hy, 14);
    g.lineStyle(3, ink);
    g.strokeCircle(hx, hy, 14);
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

/** Kitchen trash can with an open lid: drag donuts here to throw them out. */
/**
 * "mochi", the tutorial's guide: a strawberry-glazed pon de ring with a happy
 * face on its bottom balls and rosy cheeks.
 */
function paintMascot(g: G): void {
  const ink = COLORS.ink;
  const cx = 110;
  const cy = 104;
  const balls = ringBallCenters(cx, cy, 64);
  const r = ringBallRadius(64, balls.length, 1.18);
  // Dough edge, then glaze, then outlines
  g.fillStyle(0xe2a85c);
  for (const p of balls) g.fillCircle(p.x, p.y + 4, r);
  g.fillStyle(0xf4a6c0);
  for (const p of balls) g.fillCircle(p.x, p.y, r - 2);
  g.lineStyle(5, ink);
  for (const p of balls) g.strokeCircle(p.x, p.y, r - 2);
  // Gloss
  g.lineStyle(6, 0xffffff, 0.6);
  for (const p of balls) {
    g.beginPath();
    g.arc(p.x, p.y, r * 0.55, Math.PI * 1.1, Math.PI * 1.45, false);
    g.strokePath();
  }
  // Face across the lower balls: eyes, smile, cheeks.
  const eyeY = cy + 40;
  g.fillStyle(ink);
  g.fillCircle(cx - 34, eyeY, 9);
  g.fillCircle(cx + 34, eyeY, 9);
  g.fillStyle(0xffffff);
  g.fillCircle(cx - 31, eyeY - 3, 3);
  g.fillCircle(cx + 37, eyeY - 3, 3);
  g.lineStyle(6, ink);
  g.beginPath();
  g.arc(cx, eyeY + 6, 16, Math.PI * 0.15, Math.PI * 0.85, false);
  g.strokePath();
  g.fillStyle(0xff6f91, 0.7);
  g.fillEllipse(cx - 56, eyeY + 14, 22, 12);
  g.fillEllipse(cx + 56, eyeY + 14, 22, 12);
}

/** A cartoon hand pointing straight up (fingertip at the top centre); the tutorial rotates it. */
function paintPointerHand(g: G): void {
  const ink = COLORS.ink;
  g.fillStyle(0xfff4e6);
  g.lineStyle(6, ink);
  // Index finger
  g.fillRoundedRect(42, 6, 34, 86, 17);
  g.strokeRoundedRect(42, 6, 34, 86, 17);
  // Palm with curled fingers
  g.fillRoundedRect(22, 70, 84, 74, 26);
  g.strokeRoundedRect(22, 70, 84, 74, 26);
  // Thumb
  g.fillRoundedRect(6, 88, 34, 26, 13);
  g.strokeRoundedRect(6, 88, 34, 26, 13);
  // Knuckle lines
  g.lineStyle(4, ink, 0.6);
  g.lineBetween(80, 92, 100, 92);
  g.lineBetween(80, 110, 100, 110);
  // Pink cuff
  g.fillStyle(COLORS.pink);
  g.fillRect(28, 140, 72, 18);
  g.lineStyle(6, ink);
  g.strokeRect(28, 140, 72, 18);
}

/** A steel mixing bowl seen from the front-top: body, rim, and the opening (where the dough shows). */
function paintMixingBowl(g: G): void {
  const ink = COLORS.ink;
  g.fillStyle(0xb9c0c6);
  g.lineStyle(6, ink);
  g.beginPath();
  g.arc(180, 70, 170, 0, Math.PI, false);
  g.closePath();
  g.fillPath();
  g.strokePath();
  g.fillStyle(0x8f979e);
  g.fillEllipse(180, 70, 340, 90);
  g.strokeEllipse(180, 70, 340, 90);
  g.lineStyle(8, 0xffffff, 0.5);
  g.beginPath();
  g.arc(180, 70, 140, Math.PI * 0.65, Math.PI * 0.85, false);
  g.strokePath();
}

/** A white canister with a lid (tinted and labelled per ingredient in code). */
function paintIngredientBin(g: G): void {
  const ink = COLORS.ink;
  g.fillStyle(0xffffff);
  g.lineStyle(6, ink);
  g.fillRoundedRect(14, 40, 132, 146, 22);
  g.strokeRoundedRect(14, 40, 132, 146, 22);
  g.fillStyle(0xdddddd);
  g.fillRoundedRect(6, 14, 148, 36, 12);
  g.strokeRoundedRect(6, 14, 148, 36, 12);
  g.fillStyle(0xffffff, 0.9);
  g.fillRoundedRect(30, 84, 100, 60, 10);
}

/** A kitchen sponge: yellow, with a green scrubber on top. */
function paintSponge(g: G): void {
  const ink = COLORS.ink;
  g.lineStyle(5, ink);
  g.fillStyle(0xffd75e);
  g.fillRoundedRect(6, 30, 108, 44, 12);
  g.strokeRoundedRect(6, 30, 108, 44, 12);
  g.fillStyle(0x4fae6b);
  g.fillRoundedRect(6, 8, 108, 26, 10);
  g.strokeRoundedRect(6, 8, 108, 26, 10);
  g.fillStyle(0xe8b93f);
  for (let i = 0; i < 6; i++) g.fillCircle(22 + i * 16, 52 + (i % 2) * 8, 4);
}

/** The pop-up booth for event days: striped canopy with a blank banner, poles, and a table. */
function paintPopupBooth(g: G): void {
  const ink = COLORS.ink;
  // Poles
  g.fillStyle(0xd7dce0);
  g.lineStyle(6, ink);
  for (const x of [70, 830]) {
    g.fillRect(x - 10, 200, 20, 400);
    g.strokeRect(x - 10, 200, 20, 400);
  }
  // Canopy: stripes, then a scalloped edge
  const stripes = 10;
  for (let i = 0; i < stripes; i++) {
    g.fillStyle(i % 2 ? 0xffffff : COLORS.pink);
    g.fillRect(30 + (840 / stripes) * i, 60, 840 / stripes, 150);
  }
  g.strokeRect(30, 60, 840, 150);
  for (let i = 0; i < stripes; i++) {
    g.fillStyle(i % 2 ? 0xffffff : COLORS.pink);
    g.fillCircle(30 + (840 / stripes) * (i + 0.5), 210, 840 / stripes / 2);
  }
  g.lineStyle(6, ink);
  for (let i = 0; i < stripes; i++) {
    g.beginPath();
    g.arc(30 + (840 / stripes) * (i + 0.5), 210, 840 / stripes / 2, 0, Math.PI, false);
    g.strokePath();
  }
  // Blank banner (the logo goes on it in code)
  g.fillStyle(0xfffaf0);
  g.fillRoundedRect(250, 85, 400, 130, 18);
  g.strokeRoundedRect(250, 85, 400, 130, 18);
  // Table with a cloth
  g.fillStyle(0xfffaf0);
  g.fillRect(60, 470, 780, 130);
  g.strokeRect(60, 470, 780, 130);
  g.fillStyle(COLORS.pink);
  g.fillRect(60, 470, 780, 26);
  g.strokeRect(60, 470, 780, 26);
}

/** A soft cartoon cloud. */
function paintCloud(g: G): void {
  g.fillStyle(0xffffff, 0.95);
  g.fillEllipse(120, 72, 220, 64);
  g.fillCircle(80, 56, 38);
  g.fillCircle(132, 42, 48);
  g.fillCircle(178, 60, 32);
  g.fillStyle(0xe8eef4, 0.9);
  g.fillEllipse(120, 92, 200, 22);
}

/** A Louisiana live oak: a wide, low canopy with Spanish moss hanging down. */
function paintOakTree(g: G): void {
  const ink = COLORS.ink;
  // Trunk and spreading branches
  g.fillStyle(0x6b4a33);
  g.lineStyle(5, ink);
  g.fillRect(205, 230, 50, 190);
  g.strokeRect(205, 230, 50, 190);
  g.lineStyle(26, 0x6b4a33);
  g.lineBetween(230, 250, 110, 190);
  g.lineBetween(230, 250, 360, 180);
  // Canopy: overlapping blobs, dark then light
  g.fillStyle(0x3f6b3a);
  for (const [x, y, r] of [[90, 170, 80], [170, 120, 95], [270, 110, 100], [360, 160, 85], [230, 190, 90], [60, 210, 55], [400, 210, 55]] as const) g.fillCircle(x, y, r);
  g.fillStyle(0x58894c);
  for (const [x, y, r] of [[150, 100, 60], [260, 85, 65], [340, 130, 50], [100, 150, 45]] as const) g.fillCircle(x, y, r);
  // Spanish moss: grey-green strands
  g.lineStyle(6, 0x9fae8f, 0.9);
  for (let i = 0; i < 16; i++) {
    const x = 40 + i * 25;
    const top = 200 + ((i * 37) % 50);
    g.lineBetween(x, top, x + ((i % 3) - 1) * 6, top + 40 + ((i * 53) % 45));
  }
}

/** A wooden picnic table under a pink patio umbrella, front view. */
function paintPatioTable(g: G): void {
  const ink = COLORS.ink;
  // Umbrella pole and canopy
  g.fillStyle(0xd7dce0);
  g.fillRect(146, 60, 8, 170);
  g.fillStyle(COLORS.pink);
  g.lineStyle(5, ink);
  g.beginPath();
  g.moveTo(10, 90);
  g.lineTo(150, 20);
  g.lineTo(290, 90);
  g.closePath();
  g.fillPath();
  g.strokePath();
  g.fillStyle(0xffffff);
  g.fillTriangle(150, 20, 110, 90, 150, 90);
  g.fillTriangle(150, 20, 190, 90, 230, 90);
  // Table top, legs and benches
  g.fillStyle(0xb07a4a);
  g.fillRect(40, 200, 220, 26);
  g.strokeRect(40, 200, 220, 26);
  g.fillStyle(0x8c5d36);
  g.fillRect(60, 226, 14, 60);
  g.fillRect(226, 226, 14, 60);
  g.fillRect(20, 250, 260, 16);
  g.strokeRect(20, 250, 260, 16);
}

/** A wooden planter box with flowers. */
/**
 * A courier's little hatchback, side view, facing left. Drawn in white and
 * light grey so a tint gives each courier their own colour (wheels and
 * windows stay dark).
 */
function paintCourierCar(g: G): void {
  const ink = COLORS.ink;
  // Body and cabin.
  g.fillStyle(0xffffff);
  g.fillRoundedRect(14, 62, 292, 60, 22);
  g.fillRoundedRect(70, 18, 170, 70, { tl: 40, tr: 26, bl: 0, br: 0 });
  g.lineStyle(5, ink);
  g.strokeRoundedRect(14, 62, 292, 60, 22);
  g.strokeRoundedRect(70, 18, 170, 70, { tl: 40, tr: 26, bl: 0, br: 0 });
  // Windows.
  g.fillStyle(0x35414d);
  g.fillRoundedRect(84, 30, 66, 40, { tl: 26, tr: 6, bl: 4, br: 4 });
  g.fillRoundedRect(160, 30, 66, 40, { tl: 6, tr: 16, bl: 4, br: 4 });
  // Lights and a door line.
  g.fillStyle(0xfff3b0);
  g.fillRoundedRect(16, 74, 18, 14, 5);
  g.fillStyle(0xff8a8a);
  g.fillRoundedRect(288, 74, 16, 14, 5);
  g.lineStyle(3, ink, 0.5);
  g.lineBetween(155, 70, 155, 116);
  // Wheels.
  for (const x of [78, 240]) {
    g.fillStyle(0x222222);
    g.fillCircle(x, 124, 26);
    g.fillStyle(0xbfc4c9);
    g.fillCircle(x, 124, 11);
  }
}

function paintPlanter(g: G): void {
  const ink = COLORS.ink;
  g.fillStyle(0x4f8a46);
  for (const [x, y, r] of [[30, 60, 22], [62, 46, 26], [96, 52, 24], [124, 64, 20]] as const) g.fillCircle(x, y, r);
  for (const [x, y, c] of [[34, 48, COLORS.pink], [70, 34, 0xffffff], [100, 44, 0xffd166], [124, 54, COLORS.pink], [56, 60, 0xffd166]] as const) {
    g.fillStyle(c);
    g.fillCircle(x, y, 9);
  }
  g.fillStyle(0xa8714a);
  g.lineStyle(5, ink);
  g.fillRect(10, 74, 130, 52);
  g.strokeRect(10, 74, 130, 52);
  g.lineStyle(3, 0x7d5234);
  g.lineBetween(10, 100, 140, 100);
}

function paintIconDough(g: G): void {
  g.fillStyle(COLORS.cream);
  g.beginPath();
  g.arc(48, 46, 38, 0, Math.PI, false);
  g.closePath();
  g.fillPath();
  g.fillRect(14, 40, 68, 8);
  g.lineStyle(7, COLORS.cream);
  g.lineBetween(62, 40, 84, 8);
}

function paintTrashBin(g: G): void {
  const ink = COLORS.ink;
  g.fillStyle(0x6b6f73);
  g.fillPoints([new Phaser.Math.Vector2(30, 50), new Phaser.Math.Vector2(130, 50), new Phaser.Math.Vector2(118, 150), new Phaser.Math.Vector2(42, 150)], true);
  g.lineStyle(6, ink);
  g.strokePoints([new Phaser.Math.Vector2(30, 50), new Phaser.Math.Vector2(130, 50), new Phaser.Math.Vector2(118, 150), new Phaser.Math.Vector2(42, 150)], true);
  g.lineStyle(4, ink, 0.5);
  for (const x of [62, 80, 98]) g.lineBetween(x, 66, x, 136);
  // Lid, tipped open
  g.fillStyle(0x8a9097);
  g.fillRoundedRect(22, 22, 116, 18, 8);
  g.lineStyle(5, ink);
  g.strokeRoundedRect(22, 22, 116, 18, 8);
  g.fillRect(70, 10, 20, 12);
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

/**
 * Pouring cup, drawn white/light grey so it can be tinted with each glaze's
 * colour at runtime (one texture, many coloured cups). Spout at the top left.
 */
function paintGlazeCup(g: G): void {
  const ink = COLORS.ink;
  const body = [
    new Phaser.Math.Vector2(22, 40),
    new Phaser.Math.Vector2(118, 40),
    new Phaser.Math.Vector2(106, 146),
    new Phaser.Math.Vector2(34, 146),
  ];
  g.fillStyle(0xffffff);
  g.fillPoints(body, true);
  // Liquid line and a little shine
  g.fillStyle(0xe6e6e6);
  g.fillEllipse(70, 44, 96, 18);
  g.fillStyle(0xffffff, 0.9);
  g.fillRect(44, 60, 10, 70);
  // Spout
  g.fillStyle(0xffffff);
  g.fillTriangle(22, 40, 6, 26, 36, 40);
  g.lineStyle(6, ink);
  g.strokePoints(body, true);
  g.lineBetween(22, 40, 6, 26);
  g.lineBetween(6, 26, 36, 40);
  // Handle
  g.lineStyle(8, ink);
  g.beginPath();
  g.arc(120, 92, 22, -Math.PI / 2, Math.PI / 2);
  g.strokePath();
}

/** Powdered-sugar sifter: a mesh cup with a handle. */
function paintSugarSifter(g: G): void {
  const ink = COLORS.ink;
  g.fillStyle(0xc9ced3);
  g.fillRoundedRect(20, 30, 100, 90, 18);
  g.fillStyle(0xffffff);
  g.fillEllipse(70, 40, 92, 22);
  g.lineStyle(3, 0x8a9097);
  for (let x = 30; x <= 110; x += 10) g.lineBetween(x, 104, x, 120);
  g.lineStyle(6, ink);
  g.strokeRoundedRect(20, 30, 100, 90, 18);
  g.fillStyle(COLORS.pink);
  g.fillRoundedRect(118, 60, 34, 18, 8);
}

/** An empty glass jar with a lid. The topping inside is drawn over it in code, per topping. */
function paintToppingJar(g: G): void {
  const ink = COLORS.ink;
  g.fillStyle(0xdff3fa, 0.55);
  g.fillRoundedRect(15, 35, 130, 180, 30);
  g.lineStyle(6, ink);
  g.strokeRoundedRect(15, 35, 130, 180, 30);
  g.fillStyle(COLORS.pinkDark);
  g.fillRoundedRect(30, 0, 100, 42, 10);
  g.strokeRoundedRect(30, 0, 100, 42, 10);
  g.lineStyle(8, 0xffffff, 0.5);
  g.lineBetween(36, 70, 36, 150);
}

/** The box lid, closed: plain kraft card. The logo is placed on it in code. */
function paintDonutBox(g: G): void {
  g.fillStyle(0xd8b58a);
  g.fillRoundedRect(0, 0, 620, 420, 24);
  g.lineStyle(8, COLORS.ink);
  g.strokeRoundedRect(4, 4, 612, 412, 22);
  g.lineStyle(4, 0xb48d5f);
  g.strokeRoundedRect(26, 26, 568, 368, 16);
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

/** The Bake station's oven, front view: a steel box, a window (the pan shows through it, drawn in code) and knobs. */
function paintOven(g: G): void {
  g.fillStyle(0x000000, 0.25);
  g.fillRoundedRect(10, 16, 420, 300, 26);
  g.fillStyle(0xcfd3d6);
  g.fillRoundedRect(0, 0, 420, 300, 26);
  g.lineStyle(7, COLORS.ink);
  g.strokeRoundedRect(4, 4, 412, 292, 24);
  // Window: ≈ (40, 60) to (380, 250).
  g.fillStyle(0x2b2522);
  g.fillRoundedRect(40, 60, 340, 190, 18);
  g.lineStyle(5, COLORS.ink);
  g.strokeRoundedRect(40, 60, 340, 190, 18);
  // Handle.
  g.fillStyle(0x8f969b);
  g.fillRoundedRect(70, 22, 280, 20, 10);
  g.strokeRoundedRect(70, 22, 280, 20, 10);
  g.fillStyle(COLORS.ink);
  for (const x of [380, 400]) g.fillCircle(x, 32, 7);
}

/** The rice cooker, front view (white, with a pink stripe). Its lid is the top 70 px. */
function paintRiceCooker(g: G): void {
  g.fillStyle(0x000000, 0.25);
  g.fillEllipse(155, 248, 280, 30);
  g.fillStyle(0xfffaf0);
  g.fillRoundedRect(20, 70, 270, 170, 40);
  g.lineStyle(6, COLORS.ink);
  g.strokeRoundedRect(20, 70, 270, 170, 40);
  g.fillStyle(0xf2efe8);
  g.fillEllipse(155, 72, 270, 70);
  g.strokeEllipse(155, 72, 270, 70);
  g.fillStyle(COLORS.ink);
  g.fillRoundedRect(130, 30, 50, 22, 10);
  g.fillStyle(COLORS.pink);
  g.fillRect(24, 150, 262, 18);
  g.fillStyle(0x2b2522);
  g.fillRoundedRect(110, 180, 90, 40, 10);
}

/** A sheet of nori (it's dragged onto the onigiri). */
function paintNori(g: G): void {
  g.fillStyle(0x1f2a1c);
  g.fillRoundedRect(0, 0, 120, 150, 8);
  g.lineStyle(4, COLORS.ink);
  g.strokeRoundedRect(2, 2, 116, 146, 8);
  g.lineStyle(3, 0x34452e);
  for (let y = 22; y < 150; y += 26) g.lineBetween(8, y, 112, y);
}

function paintIconBake(g: G): void {
  g.fillStyle(COLORS.cream);
  g.fillRoundedRect(8, 14, 80, 70, 10);
  g.fillStyle(COLORS.tabBar);
  g.fillRoundedRect(18, 32, 60, 40, 8);
  g.fillStyle(COLORS.cream);
  g.fillEllipse(48, 54, 40, 18);
}

function paintIconRice(g: G): void {
  g.fillStyle(COLORS.cream);
  g.fillTriangle(48, 10, 10, 82, 86, 82);
  g.fillStyle(COLORS.tabBar);
  g.fillRect(32, 58, 32, 24);
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
  [TextureKeys.TrashBin]: { width: 160, height: 160, paint: paintTrashBin },
  [TextureKeys.PointerHand]: { width: 120, height: 164, paint: paintPointerHand },
  [TextureKeys.Mascot]: { width: 220, height: 210, paint: paintMascot },
  [TextureKeys.MixingBowl]: { width: 360, height: 250, paint: paintMixingBowl },
  [TextureKeys.IngredientBin]: { width: 160, height: 200, paint: paintIngredientBin },
  [TextureKeys.Sponge]: { width: 120, height: 84, paint: paintSponge },
  [TextureKeys.PopupBooth]: { width: 900, height: 620, paint: paintPopupBooth },
  [TextureKeys.IconDough]: { width: 96, height: 96, paint: paintIconDough },
  [TextureKeys.Cloud]: { width: 240, height: 110, paint: paintCloud },
  [TextureKeys.OakTree]: { width: 460, height: 420, paint: paintOakTree },
  [TextureKeys.PatioTable]: { width: 300, height: 290, paint: paintPatioTable },
  [TextureKeys.Planter]: { width: 150, height: 130, paint: paintPlanter },
  [TextureKeys.CourierCar]: { width: 320, height: 156, paint: paintCourierCar },
  [TextureKeys.FryDispenser]: { width: 215, height: 175, paint: paintFryDispenser },
  [TextureKeys.DonutFry]: { width: 160, height: 160, paint: paintDonutFry },
  [TextureKeys.GlazeCup]: { width: 150, height: 160, paint: paintGlazeCup },
  [TextureKeys.SugarSifter]: { width: 160, height: 140, paint: paintSugarSifter },
  [TextureKeys.ToppingJar]: { width: 160, height: 220, paint: paintToppingJar },
  [TextureKeys.DonutBox]: { width: 620, height: 420, paint: paintDonutBox },
  [TextureKeys.IconLobby]: { width: 96, height: 96, paint: paintIconLobby },
  [TextureKeys.IconFry]: { width: 96, height: 96, paint: paintIconFry },
  [TextureKeys.IconGlaze]: { width: 96, height: 96, paint: paintIconGlaze },
  [TextureKeys.IconToppings]: { width: 96, height: 96, paint: paintIconToppings },
  [TextureKeys.IconBox]: { width: 96, height: 96, paint: paintIconBox },
  [TextureKeys.Oven]: { width: 430, height: 316, paint: paintOven },
  [TextureKeys.RiceCooker]: { width: 310, height: 264, paint: paintRiceCooker },
  [TextureKeys.Nori]: { width: 120, height: 150, paint: paintNori },
  [TextureKeys.IconBake]: { width: 96, height: 96, paint: paintIconBake },
  [TextureKeys.IconRice]: { width: 96, height: 96, paint: paintIconRice },
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

// ---- Mixed-up customers -----------------------------------------------------------
// Walk-ups come in many looks (Kumar: "the same type of customers each time"):
// skin, hair colour and style, shirt and trousers, and an extra (glasses, a cap,
// a backpack), mixed into CUSTOMER_MIX steady combinations. Regulars keep their
// own look, so you know them when they come back.

/** How many mixed customer looks there are (textures customer-mix-0 …). */
export const CUSTOMER_MIX = 18;
export const customerMixKey = (i: number): string => `customer-mix-${i}`;

const MIX_SKIN = [0xffdbac, 0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0x6b4226];
const MIX_HAIR = [0x1b1210, 0x3b2a20, 0x6b4423, 0xd6a95b, 0xa8a8a8, 0xb5452f];
const MIX_SHIRT = [0x4caf8a, 0xf4a6c0, 0xffd27a, 0x6a8fd0, 0xe57373, 0x9c7bd0, 0x5a8a4a, 0xf2efe8, 0xff9f4a];
const MIX_PANTS = [0x3b4a6b, 0x2f3440, 0x4a4a5a, 0x6b5a4a, 0x7a8fa6];

function paintMixCustomer(i: number): (g: G) => void {
  const pick = <T,>(list: readonly T[], prime: number): T => list[(i * prime + Math.floor(i / list.length)) % list.length]!;
  const skin = pick(MIX_SKIN, 5);
  const hair = pick(MIX_HAIR, 7);
  const shirt = pick(MIX_SHIRT, 4);
  const pants = pick(MIX_PANTS, 3);
  const style = i % 4; // short, long, puff, bun
  const extra = Math.floor(i / 4) % 4; // none, glasses, cap, backpack
  return (g) => {
    // Long hair and a puff sit behind the head and shoulders.
    g.fillStyle(hair);
    if (style === 1) g.fillRoundedRect(32, 50, 116, 120, 40);
    if (style === 2) g.fillCircle(90, 62, 70);
    g.fillStyle(pants);
    g.fillRect(45, 280, 35, 60);
    g.fillRect(100, 280, 35, 60);
    g.fillStyle(shirt);
    g.fillRoundedRect(30, 130, 120, 170, 40);
    if (extra === 3) {
      // Backpack straps.
      g.fillStyle(0x2b2b2b);
      g.fillRect(44, 140, 14, 120);
      g.fillRect(122, 140, 14, 120);
    }
    g.fillStyle(skin);
    g.fillCircle(90, 75, 55);
    g.fillStyle(hair);
    if (style !== 2) g.fillEllipse(90, 38, 112, 50);
    if (style === 3) g.fillCircle(90, 10, 22); // a bun on top
    if (extra === 2) {
      // A cap with a brim.
      g.fillStyle(shirt === 0xf2efe8 ? 0x6a8fd0 : 0xf2efe8);
      g.fillEllipse(90, 34, 116, 46);
      g.fillRoundedRect(90, 38, 66, 12, 6);
    }
    paintFace(g);
    if (extra === 1) {
      // Round glasses.
      g.lineStyle(4, DARK);
      g.strokeCircle(70, 78, 14);
      g.strokeCircle(110, 78, 14);
      g.lineBetween(84, 78, 96, 78);
    }
  };
}

/** Make the mixed customer textures (once). */
export function ensureCustomerMix(scene: Phaser.Scene): void {
  for (let i = 0; i < CUSTOMER_MIX; i++) {
    const key = customerMixKey(i);
    if (scene.textures.exists(key)) continue;
    const g = scene.make.graphics({}, false);
    paintMixCustomer(i)(g);
    g.generateTexture(key, 180, 340);
    g.destroy();
  }
}
