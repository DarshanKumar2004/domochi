import Phaser from 'phaser';
import { TextureKeys } from '../assets/keys';
import type { DayPhase } from '../systems/GameSession';
import type { Viewport } from './layout';
import { COLORS } from './theme';

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
  cloudy: { toward: 0xb8c2cc, amount: 0.45, sun: 0.35, sunScale: 1, cloud: 0xdde3e8 },
  rainy: { toward: 0x7d8894, amount: 0.7, sun: 0, sunScale: 1, cloud: 0x9aa3ad },
  hot: { toward: 0xffc46b, amount: 0.25, sun: 1, sunScale: 1.4, cloud: 0xffffff },
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
  private readonly lights: Phaser.GameObjects.Graphics;
  private readonly ground: Phaser.GameObjects.Graphics;
  private readonly patio: Phaser.GameObjects.Graphics;
  private readonly table: Phaser.GameObjects.Image;
  private readonly planter: Phaser.GameObjects.Image;
  private sceneryLayout: SceneryLayout | null = null;
  private viewport: Viewport | null = null;
  private time: keyof typeof SKIES = 'day';
  private weather = 'sunny';
  private readonly rain: Phaser.GameObjects.Graphics;
  private readonly drops: { x: number; y: number; speed: number }[] = [];

  constructor(scene: Phaser.Scene) {
    this.sky = scene.add.graphics().setDepth(-20);
    this.sunGlow = scene.add.circle(0, 0, 90, 0xffffff, 0.25).setDepth(-19);
    this.sun = scene.add.circle(0, 0, 55, 0xffffff).setDepth(-19);
    for (let i = 0; i < CLOUDS; i++) this.clouds.push(scene.add.image(0, 0, TextureKeys.Cloud).setDepth(-18).setAlpha(0.9));
    this.trees = [scene.add.image(0, 0, TextureKeys.OakTree).setOrigin(0.5, 1).setDepth(-17), scene.add.image(0, 0, TextureKeys.OakTree).setOrigin(0.5, 1).setDepth(-17).setFlipX(true)];
    this.lights = scene.add.graphics().setDepth(-16);
    this.ground = scene.add.graphics().setDepth(-15);
    this.patio = scene.add.graphics().setDepth(-13);
    this.table = scene.add.image(0, 0, TextureKeys.PatioTable).setOrigin(0.5, 1).setDepth(-12);
    this.planter = scene.add.image(0, 0, TextureKeys.Planter).setOrigin(0.5, 1).setDepth(-2);
    this.rain = scene.add.graphics().setDepth(9).setVisible(false);
    for (let i = 0; i < RAIN; i++) this.drops.push({ x: 0, y: 0, speed: 900 + ((i * 137) % 500) });
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
    this.table.setPosition(p.x, p.y - p.h / 2 + (L ? 190 : 230)).setScale(L ? 0.6 : 0.75);

    this.planter.setPosition(l.sign.x + (L ? 95 : 110), l.sign.feetY + 6).setScale(L ? 0.65 : 0.8);
    this.clouds.forEach((c, i) => c.setPosition(((i * 0.37 + 0.1) % 1) * v.width, (v.content.y || 0) + (L ? 40 : 70) + i * (L ? 45 : 70)).setScale(L ? 0.7 : 0.9));
    this.drawSkyAndLights();
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
      g.fillStyle(0xfff3c4, 0.5 + 0.5 * s.glow);
      g.fillCircle(x, y, 8);
      g.lineStyle(2, COLORS.ink, 0.6);
      g.strokeCircle(x, y, 8);
    }
  }
}
