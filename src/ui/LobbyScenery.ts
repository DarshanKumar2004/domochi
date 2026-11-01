import Phaser from 'phaser';
import { TextureKeys } from '../assets/keys';
import type { DayPhase } from '../systems/GameSession';
import type { Viewport } from './layout';
import { COLORS, FONT_FAMILY } from './theme';

/** Sky colours (top, bottom), sun colour and string-light glow, by time of day. */
const SKIES: Record<'morning' | 'day' | 'sunset', { top: number; bottom: number; sun: number; glow: number }> = {
  morning: { top: 0xf3b9a0, bottom: 0xfde7c4, sun: 0xffd27a, glow: 0.55 },
  day: { top: 0x8fd0ee, bottom: 0xd9f0fa, sun: 0xfff1a8, glow: 0.2 },
  sunset: { top: 0x6b5b9e, bottom: 0xf6a46b, sun: 0xff9a4d, glow: 1 },
};
const CLOUDS = 3;
/** Raindrops on a rainy day (fixed pool: nothing is allocated while it rains). */
const RAIN = 90;

/** Blend two colours (t = 0: a, 1: b). */
function mix(a: number, b: number, t: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** How the weather changes the sky: blend towards a colour, sun brightness and size, cloud tint. */
const WEATHER_LOOK: Record<string, { toward: number; amount: number; sun: number; sunScale: number; cloud: number }> = {
  sunny: { toward: 0xffffff, amount: 0, sun: 1, sunScale: 1, cloud: 0xffffff },
  cloudy: { toward: 0xb0bac4, amount: 0.55, sun: 0.25, sunScale: 1, cloud: 0xdde3e8 },
  rainy: { toward: 0x7d8894, amount: 0.7, sun: 0, sunScale: 1, cloud: 0x9aa3ad },
  hot: { toward: 0xffb35c, amount: 0.4, sun: 1, sunScale: 1.6, cloud: 0xffffff },
};
/** Cloud drift, px per second. */
const CLOUD_SPEED = [14, 9, 20];

export interface SceneryLayout {
  /** Where the ground starts (screen y). */
  groundY: number;
  truck: { x: number; y: number; scale: number };
  sign: { x: number; feetY: number };
  /** The waiting patio (centre and size). */
  patio: { x: number; y: number; w: number; h: number };
}

/**
 * The lot by the trailer, drawn behind everything in the Lobby: a sky that
 * follows the day (sunrise for prep, blue while open, sunset at closing),
 * drifting clouds, live oaks with Spanish moss, bistro string lights, a
 * grass verge and sidewalk, the concrete lot, and a little patio with a
 * picnic table where waiting customers stand.
 */
export class LobbyScenery {
  private readonly sky: Phaser.GameObjects.Graphics;
  private readonly sun: Phaser.GameObjects.Arc;
  private readonly sunGlow: Phaser.GameObjects.Arc;
  private readonly clouds: Phaser.GameObjects.Image[] = [];
  private readonly trees: Phaser.GameObjects.Image[];
  /** Landscape fills the wide middle of the lot: two smaller oaks, a hedge, a street lamp and a bench. */
  private readonly moreTrees: Phaser.GameObjects.Image[];
  private readonly verge: Phaser.GameObjects.Graphics;
  private readonly lights: Phaser.GameObjects.Graphics;
  private readonly ground: Phaser.GameObjects.Graphics;
  private readonly patio: Phaser.GameObjects.Graphics;
  private readonly table: Phaser.GameObjects.Image;
  private readonly planter: Phaser.GameObjects.Image;
  private sceneryLayout: SceneryLayout | null = null;
  private viewport: Viewport | null = null;
  private time: keyof typeof SKIES = 'day';
  /** Decorations on the lot (balance.decor ids). */
  private decor = new Set<string>();
  private readonly decorArt: Phaser.GameObjects.Graphics;
  private readonly table2: Phaser.GameObjects.Image;
  private readonly planters: Phaser.GameObjects.Image[];
  private readonly neon: Phaser.GameObjects.Text;
  private weather = 'sunny';
  /** Pop-up days: a downtown storefront behind the booth instead of the oaks. */
  private downtown = false;
  private readonly storefront: Phaser.GameObjects.Graphics;
  private readonly storeSign: Phaser.GameObjects.Text;
  /** The sign board (above the string lights, below the booth). */
  private readonly signBoard: Phaser.GameObjects.Graphics;
  private readonly rain: Phaser.GameObjects.Graphics;
  private readonly drops: { x: number; y: number; speed: number }[] = [];

  constructor(scene: Phaser.Scene) {
    this.sky = scene.add.graphics().setDepth(-20);
    this.sunGlow = scene.add.circle(0, 0, 90, 0xffffff, 0.25).setDepth(-19);
    this.sun = scene.add.circle(0, 0, 55, 0xffffff).setDepth(-19);
    for (let i = 0; i < CLOUDS; i++) this.clouds.push(scene.add.image(0, 0, TextureKeys.Cloud).setDepth(-18).setAlpha(0.9));
    this.trees = [scene.add.image(0, 0, TextureKeys.OakTree).setOrigin(0.5, 1).setDepth(-17), scene.add.image(0, 0, TextureKeys.OakTree).setOrigin(0.5, 1).setDepth(-17).setFlipX(true)];
    this.moreTrees = [0, 1].map((i) => scene.add.image(0, 0, TextureKeys.OakTree).setOrigin(0.5, 1).setDepth(-17.2).setFlipX(i === 1));
    this.verge = scene.add.graphics().setDepth(-14.5);
    this.lights = scene.add.graphics().setDepth(-16);
    this.ground = scene.add.graphics().setDepth(-15);
    this.patio = scene.add.graphics().setDepth(-13);
    this.table = scene.add.image(0, 0, TextureKeys.PatioTable).setOrigin(0.5, 1).setDepth(-12);
    this.planter = scene.add.image(0, 0, TextureKeys.Planter).setOrigin(0.5, 1).setDepth(-2);
    this.rain = scene.add.graphics().setDepth(9).setVisible(false);
    this.decorArt = scene.add.graphics().setDepth(-12.5);
    this.table2 = scene.add.image(0, 0, TextureKeys.PatioTable).setOrigin(0.5, 1).setDepth(-11.9).setVisible(false);
    this.planters = [0, 1].map(() => scene.add.image(0, 0, TextureKeys.Planter).setOrigin(0.5, 1).setDepth(-11.8).setVisible(false));
    this.neon = scene.add
      .text(0, 0, 'mochi donuts', { fontFamily: FONT_FAMILY, fontSize: '46px', fontStyle: 'bold', color: '#ffe3ef', stroke: '#ff5fa2', strokeThickness: 6 })
      .setOrigin(0.5)
      .setDepth(-13)
      .setShadow(0, 0, '#ff5fa2', 18, true, true)
      .setVisible(false)
      .setName('decor-neon');
    this.storefront = scene.add.graphics().setDepth(-16.5).setVisible(false);
    this.storeSign = scene.add
      .text(0, 0, 'Gator & Co.', { fontFamily: FONT_FAMILY, fontSize: '54px', fontStyle: 'bold', color: '#fbf6ec' })
      .setOrigin(0.5)
      .setDepth(-15.8)
      .setVisible(false);
    this.signBoard = scene.add.graphics().setDepth(-15.9).setVisible(false);
    for (let i = 0; i < RAIN; i++) this.drops.push({ x: 0, y: 0, speed: 900 + ((i * 137) % 500) });
  }

  /**
   * A pop-up day downtown: a brick storefront ("Gator & Co.", made up) with a
   * striped awning and shop windows behind the booth, instead of the oaks.
   */
  setDowntown(on: boolean): void {
    this.downtown = on;
    for (const t of this.trees) t.setVisible(!on);
    const v = this.viewport;
    const wide = !!v && v.orientation === 'landscape';
    for (const t of this.moreTrees) t.setVisible(!on && wide);
    this.verge.setVisible(!on && wide);
    this.storefront.setVisible(on);
    this.storeSign.setVisible(on);
    this.signBoard.setVisible(on);
    if (this.viewport && this.sceneryLayout) this.drawStorefront(this.viewport, this.sceneryLayout);
  }

  private drawStorefront(v: Viewport, l: SceneryLayout): void {
    const g = this.storefront;
    g.clear();
    if (!this.downtown) return;
    const L = v.orientation === 'landscape';
    const gy = l.groundY;
    const top = v.content.y + (L ? 40 : 20);
    const h = gy - top;
    // Brick, edge to edge, with mortar lines.
    g.fillStyle(0xa6533c);
    g.fillRect(0, top, v.width, h);
    g.lineStyle(2, 0x8a4230, 0.8);
    for (let y = top + 22, row = 0; y < gy; y += 22, row++) {
      g.lineBetween(0, y, v.width, y);
      for (let x = row % 2 ? 0 : 30; x < v.width; x += 60) g.lineBetween(x, y - 22, x, y);
    }
    // A cornice along the top.
    g.fillStyle(0x6e3426);
    g.fillRect(0, top, v.width, 26);
    // Shop windows with dark glass and cream frames, every so often.
    const winW = L ? 230 : 200;
    const winH = Math.min(h * 0.55, L ? 190 : 260);
    const winY = gy - winH - 30;
    for (let x = 40; x + winW < v.width; x += winW + (L ? 120 : 90)) {
      g.fillStyle(0xfbf6ec);
      g.fillRect(x - 8, winY - 8, winW + 16, winH + 16);
      g.fillStyle(0x2f3a40);
      g.fillRect(x, winY, winW, winH);
      g.fillStyle(0xffffff, 0.12);
      g.fillTriangle(x, winY, x + winW * 0.5, winY, x, winY + winH * 0.6);
      g.lineStyle(4, 0xfbf6ec);
      g.lineBetween(x + winW / 2, winY, x + winW / 2, winY + winH);
    }
    // A striped awning over the windows, scalloped edge.
    const awY = winY - 70;
    const stripe = 50;
    for (let x = 0, i = 0; x < v.width; x += stripe, i++) {
      g.fillStyle(i % 2 ? 0xfbf6ec : 0xf4a6c0);
      g.fillRect(x, awY, stripe, 50);
      g.fillCircle(x + stripe / 2, awY + 50, stripe / 2);
    }
    g.lineStyle(4, 0x1f1a17, 0.6);
    g.lineBetween(0, awY, v.width, awY);
    // The shop's sign board above the awning.
    // (In portrait the booth stands in front, so the sign goes up top, clear of it.)
    const signY = L ? (top + 26 + awY) / 2 : top + 85;
    const sb = this.signBoard;
    sb.clear();
    sb.fillStyle(0x1f1a17);
    sb.fillRoundedRect(v.width / 2 - 230, signY - 45, 460, 90, 14);
    sb.lineStyle(4, 0xfbf6ec, 0.8);
    sb.strokeRoundedRect(v.width / 2 - 222, signY - 37, 444, 74, 10);
    this.storeSign.setPosition(v.width / 2, signY).setScale(L ? 0.85 : 1);
  }

  /** Show the lot's decorations (balance.decor ids). */
  setDecor(ids: readonly string[]): void {
    this.decor = new Set(ids);
    if (this.viewport && this.sceneryLayout) this.layoutDecor(this.viewport, this.sceneryLayout);
    this.drawSkyAndLights();
  }

  private layoutDecor(v: Viewport, l: SceneryLayout): void {
    const L = v.orientation === 'landscape';
    const p = l.patio;
    const has = (id: string) => this.decor.has(id);
    // A second picnic table at the front of the patio.
    this.table2.setVisible(has('table')).setPosition(p.x, p.y + p.h / 2 - (L ? 20 : 40)).setScale(L ? 0.4 : 0.6);
    // Flower boxes at the patio's front corners.
    this.planters.forEach((pl, i) =>
      pl
        .setVisible(has('flowers'))
        .setPosition(p.x + (i ? 1 : -1) * (p.w / 2 - (L ? 40 : 55)), p.y + p.h / 2 + (L ? 14 : 18))
        .setScale(L ? 0.5 : 0.65),
    );
    // A neon sign glowing above the trailer (in landscape there's no room up there: over the patio).
    const t = l.truck;
    if (L) this.neon.setVisible(has('neon')).setPosition(p.x, p.y - p.h / 2 - 34).setScale(0.8);
    else this.neon.setVisible(has('neon')).setPosition(t.x + 140 * t.scale, t.y - 345 * t.scale).setScale(t.scale * 1.1);
    // A mochi mural painted on the patio deck.
    const g = this.decorArt;
    g.clear();
    if (has('mural')) {
      // mochi, painted on the deck: eight pink balls with ink outlines, and a smile.
      const r = Math.min(p.w, p.h) * 0.13;
      const cx = p.x + p.w * 0.27;
      const cy = p.y + p.h * (L ? 0.05 : 0.1);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const bx = cx + Math.cos(a) * r;
        const by = cy + Math.sin(a) * r * 0.7;
        g.fillStyle(0xf4a6c0, 0.85);
        g.fillCircle(bx, by, r * 0.45);
        g.lineStyle(3, 0x1f1a17, 0.6);
        g.strokeCircle(bx, by, r * 0.45);
      }
      g.fillStyle(0x1f1a17, 0.7);
      g.fillCircle(cx - r * 0.25, cy + r * 0.62, 3);
      g.fillCircle(cx + r * 0.25, cy + r * 0.62, 3);
    }
  }

  /** Today's weather: the sky, the sun and clouds, and rain. */
  setWeather(id: string): void {
    this.weather = WEATHER_LOOK[id] ? id : 'sunny';
    const look = WEATHER_LOOK[this.weather]!;
    for (const c of this.clouds) c.setTint(look.cloud);
    this.rain.setVisible(this.weather === 'rainy');
    const v = this.viewport;
    if (v) this.drops.forEach((d, i) => ((d.x = ((i * 0.618) % 1) * v.width), (d.y = ((i * 0.381) % 1) * v.height)));
    this.drawSkyAndLights();
  }

  layout(v: Viewport, l: SceneryLayout): void {
    this.viewport = v;
    this.sceneryLayout = l;
    this.drops.forEach((d, i) => ((d.x = ((i * 0.618) % 1) * v.width), (d.y = ((i * 0.381) % 1) * v.height)));
    this.drawStorefront(v, l);
    this.layoutDecor(v, l);
    const L = v.orientation === 'landscape';
    const gy = l.groundY;

    // Ground: a grass verge, the sidewalk, then the concrete lot with parking lines.
    const g = this.ground;
    g.clear();
    g.fillStyle(0x7fb069);
    g.fillRect(0, gy - 6, v.width, 24);
    g.fillStyle(0xe6e1d6);
    g.fillRect(0, gy + 18, v.width, 46);
    g.lineStyle(3, 0xcfc8ba);
    for (let x = 40; x < v.width; x += 110) g.lineBetween(x, gy + 18, x - 12, gy + 64);
    g.fillStyle(COLORS.concrete);
    g.fillRect(0, gy + 64, v.width, v.height - gy - 64);
    g.fillStyle(0xf4f2ee);
    for (let x = 60; x < v.width; x += 240) g.fillRect(x, gy + 104, 120, 12);
    // A few oil spots so the lot isn't flat.
    g.fillStyle(0x000000, 0.05);
    for (let i = 0; i < 6; i++) g.fillEllipse((i * 397 + 150) % v.width, gy + 200 + ((i * 233) % Math.max(1, v.height - gy - 260)), 140, 40);
    // The trailer's shadow.
    g.fillStyle(0x000000, 0.14);
    g.fillEllipse(l.truck.x, gy + 82 * l.truck.scale, 760 * l.truck.scale, 60 * l.truck.scale);

    // Live oaks behind the lot, one each side.
    const ts = L ? 0.62 : 0.7;
    this.trees[0]!.setPosition(L ? 120 : 60, gy + 4).setScale(ts);
    this.trees[1]!.setPosition(v.width - (L ? 120 : 50), gy + 4).setScale(ts * 1.05);

    // The waiting patio: a wooden deck, with the picnic table at the back.
    const p = l.patio;
    const pg = this.patio;
    pg.clear();
    pg.fillStyle(0x000000, 0.12);
    pg.fillRoundedRect(p.x - p.w / 2 + 8, p.y - p.h / 2 + 10, p.w, p.h, 18);
    pg.fillStyle(0xc8955f);
    pg.fillRoundedRect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h, 18);
    pg.lineStyle(3, 0xa8764a);
    for (let y = p.y - p.h / 2 + 34; y < p.y + p.h / 2; y += 34) pg.lineBetween(p.x - p.w / 2 + 6, y, p.x + p.w / 2 - 6, y);
    pg.lineStyle(5, COLORS.ink, 0.7);
    pg.strokeRoundedRect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h, 18);
    this.table.setPosition(p.x, p.y - p.h / 2 + (L ? 150 : 230)).setScale(L ? 0.45 : 0.75);

    this.planter.setPosition(l.sign.x + (L ? 95 : 110), l.sign.feetY + 6).setScale(L ? 0.65 : 0.8);
    this.drawVerge(v, l);
    this.clouds.forEach((c, i) => c.setPosition(((i * 0.37 + 0.1) % 1) * v.width, (v.content.y || 0) + (L ? 40 : 70) + i * (L ? 45 : 70)).setScale(L ? 0.7 : 0.9));
    this.drawSkyAndLights();
  }

  /** The wide middle of the landscape lot, between the A-frame and the patio: oaks, a hedge, a lamp and a bench. */
  private drawVerge(v: Viewport, l: SceneryLayout): void {
    const show = v.orientation === 'landscape' && !this.downtown;
    for (const t of this.moreTrees) t.setVisible(show);
    const g = this.verge;
    g.clear().setVisible(show);
    if (!show) return;
    const gy = l.groundY;
    const left = l.sign.x + 170;
    const right = l.patio.x - l.patio.w / 2;
    const span = right - left;
    if (span < 200) {
      for (const t of this.moreTrees) t.setVisible(false);
      return;
    }
    this.moreTrees[0]!.setPosition(left + span * 0.22, gy + 2).setScale(0.44);
    this.moreTrees[1]!.setPosition(left + span * 0.8, gy + 2).setScale(0.5);
    // A low hedge along the grass.
    for (let x = left; x < right; x += 46) {
      const h = 26 + ((x * 7) % 13);
      g.fillStyle(0x4f8a3c);
      g.fillEllipse(x, gy - h / 2 + 6, 62, h + 10);
      g.fillStyle(0x6aa84f);
      g.fillEllipse(x - 8, gy - h / 2, 30, h * 0.6);
    }
    g.lineStyle(3, COLORS.ink, 0.35);
    for (let x = left; x < right; x += 46) g.strokeEllipse(x, gy - 7, 62, 36);
    // A street lamp.
    const lx = left + span * 0.52;
    g.fillStyle(0x3a3f45);
    g.fillRect(lx - 5, gy - 230, 10, 240);
    g.fillRoundedRect(lx - 14, gy - 4, 28, 14, 4);
    g.fillRect(lx - 3, gy - 232, 44, 8);
    g.fillStyle(0xfff3c4);
    g.fillRoundedRect(lx + 28, gy - 228, 26, 22, 6);
    g.lineStyle(3, COLORS.ink, 0.8);
    g.strokeRoundedRect(lx + 28, gy - 228, 26, 22, 6);
    // A park bench on the sidewalk, facing the lot.
    const bx = left + span * 0.36;
    const by = gy + 40;
    g.fillStyle(0x8a5a3b);
    g.fillRoundedRect(bx - 70, by - 46, 140, 14, 4);
    g.fillRoundedRect(bx - 70, by - 26, 140, 14, 4);
    g.fillStyle(0x3a3f45);
    g.fillRect(bx - 60, by - 14, 8, 26);
    g.fillRect(bx + 52, by - 14, 8, 26);
    g.lineStyle(3, COLORS.ink, 0.7);
    g.strokeRoundedRect(bx - 70, by - 46, 140, 14, 4);
    g.strokeRoundedRect(bx - 70, by - 26, 140, 14, 4);
  }

  /** Morning while prepping, day while open, sunset at closing. */
  setPhase(phase: DayPhase): void {
    const t = phase === 'prep' ? 'morning' : phase === 'open' ? 'day' : 'sunset';
    if (t === this.time) return;
    this.time = t;
    this.drawSkyAndLights();
  }

  /** Clouds drift and rain falls (no allocations: it runs every frame). */
  update(deltaMs: number): void {
    const v = this.viewport;
    if (!v) return;
    for (let i = 0; i < this.clouds.length; i++) {
      const c = this.clouds[i]!;
      c.x += (CLOUD_SPEED[i % CLOUD_SPEED.length]! * deltaMs) / 1000;
      if (c.x > v.width + 150) c.x = -150;
    }
    if (!this.rain.visible) return;
    const g = this.rain;
    g.clear();
    g.lineStyle(3, 0xdfe8f2, 0.55);
    const dt = deltaMs / 1000;
    for (const d of this.drops) {
      d.y += d.speed * dt;
      d.x -= d.speed * 0.12 * dt;
      if (d.y > v.height) {
        d.y -= v.height + 40;
        d.x = (d.x + 397) % (v.width + 100);
      }
      if (d.x < -20) d.x += v.width + 40;
      g.lineBetween(d.x, d.y, d.x - 5, d.y + 28);
    }
  }

  private drawSkyAndLights(): void {
    const v = this.viewport;
    const l = this.sceneryLayout;
    if (!v || !l) return;
    const base = SKIES[this.time];
    const look = WEATHER_LOOK[this.weather]!;
    const s = { ...base, top: mix(base.top, look.toward, look.amount), bottom: mix(base.bottom, look.toward, look.amount) };
    const L = v.orientation === 'landscape';
    this.sky.clear();
    this.sky.fillGradientStyle(s.top, s.top, s.bottom, s.bottom, 1);
    this.sky.fillRect(0, 0, v.width, l.groundY + 10);

    // The sun: low on the left in the morning, high at midday, low and big at sunset.
    const sx = this.time === 'morning' ? v.width * 0.18 : this.time === 'day' ? v.width * 0.8 : v.width * 0.86;
    const sy = this.time === 'day' ? v.content.y + (L ? 60 : 120) : l.groundY - (L ? 70 : 110);
    const sr = (this.time === 'sunset' ? 70 : 55) * look.sunScale;
    this.sun.setPosition(sx, sy).setRadius(sr).setFillStyle(s.sun).setAlpha(look.sun);
    this.sunGlow.setPosition(sx, sy).setRadius(sr * 1.7).setFillStyle(s.sun, 0.25).setAlpha(look.sun);

    // Bistro string lights draped across the top of the lot.
    const g = this.lights;
    g.clear();
    const y0 = v.content.y + (L ? 14 : 24);
    const sag = L ? 60 : 80;
    const span = v.width;
    const ys = (x: number) => y0 + sag * Math.sin((Math.PI * x) / span);
    g.lineStyle(3, COLORS.ink, 0.7);
    g.beginPath();
    g.moveTo(0, y0);
    for (let x = 20; x <= span; x += 20) g.lineTo(x, ys(x));
    g.strokePath();
    for (let x = 35; x < span; x += 70) {
      const y = ys(x) + 12;
      g.fillStyle(0xffe08a, s.glow * 0.35);
      g.fillCircle(x, y, 20);
      // Pink bulbs once the pink string lights are up.
      g.fillStyle(this.decor.has('lights') ? 0xff9ec6 : 0xfff3c4, 0.5 + 0.5 * s.glow);
      g.fillCircle(x, y, this.decor.has('lights') ? 10 : 8);
      g.lineStyle(2, COLORS.ink, 0.6);
      g.strokeCircle(x, y, 8);
    }
  }
}
