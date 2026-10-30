import Phaser from 'phaser';
import { TextureKeys } from '../assets/keys';
import { fryColor, fryVerdict, type FryResult } from '../stations/fry';
import { session } from '../systems/services';
import { Button } from '../ui/Button';
import { HoldButton } from '../ui/HoldButton';
import type { Viewport } from '../ui/layout';
import { COLORS, CSS, FONT_FAMILY } from '../ui/theme';
import { listen } from './listen';
import { SceneKeys } from './sceneKeys';
import { StationScene } from './StationScene';

/** Doneness shown on the side meters goes 0 → METER_MAX (golden = 1). */
const METER_MAX = 1.6;
const MAX_DONUTS = 12;
const DIAL_R = 120;
/** Dial sweep either side of 12 o'clock, in degrees. */
const DIAL_SWEEP = 135;
const DONUT_SIZE = 170;

const COOL = 0x6ec6ff;
const HOT = 0xe85d4a;
const GOOD = 0x7fd1ae;

interface Meter {
  label: Phaser.GameObjects.Text;
  bg: Phaser.GameObjects.Rectangle;
  band: Phaser.GameObjects.Rectangle;
  fill: Phaser.GameObjects.Rectangle;
  /** Band position as fractions of the bar. */
  bandFrom: number;
  bandTo: number;
}

type HintKey = 'noTicket' | 'alreadyFried' | 'noOil' | 'ready' | 'oilLow' | 'cool' | 'hot' | 'cooking';

/** Positions per orientation, relative to the content area. */
const LAYOUT = {
  portrait: {
    vat: { x: 540, y: 470, scale: 1.25 },
    meters: { labelX: 60, barX: 300, barW: 720, y: [810, 870] },
    timer: { x: 60, y: 940 },
    dial: { x: 190, y: 1110 },
    temp: { x: 400, y: 1000, barY: 1100, barW: 620 },
    oil: { labelX: 400, barX: 480, barW: 320, y: 1190, buttonX: 930 },
    buttons: { y: 1420, x: [190, 540, 890] },
    hint: { x: 540, y: 1300 },
  },
  landscape: {
    vat: { x: 520, y: 330, scale: 1.05 },
    meters: { labelX: 100, barX: 330, barW: 610, y: [610, 660] },
    timer: { x: 100, y: 715 },
    dial: { x: 1180, y: 360 },
    temp: { x: 1350, y: 270, barY: 360, barW: 500 },
    oil: { labelX: 1350, barX: 1430, barW: 260, y: 450, buttonX: 1800 },
    // Scaled to 0.88 in landscape so the row fits (still >= 120 px tall).
    buttons: { y: 680, x: [1170, 1440, 1720] },
    hint: { x: 1520, y: 560 },
  },
} as const;

export class FryScene extends StationScene {
  private vat!: Phaser.GameObjects.Image;
  private grate!: Phaser.GameObjects.Image;
  private donuts: Phaser.GameObjects.Image[] = [];
  private underMeter!: Meter;
  private topMeter!: Meter;
  private tempMeter!: Meter;
  private oilMeter!: Meter;
  private tempText!: Phaser.GameObjects.Text;
  private targetText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private resultText!: Phaser.GameObjects.Text;
  private dial!: Phaser.GameObjects.Container;
  private needle!: Phaser.GameObjects.Container;
  private grateButton!: HoldButton;
  private flipButton!: Button;
  private primaryButton!: Button;
  private oilButton!: Button;

  private draggingDial = false;
  // Last-shown values, so update() only touches text when something changed.
  private shownTemp = NaN;
  private shownTarget = NaN;
  private shownTimer = NaN;
  private shownHint: HintKey | null = null;
  private shownPrimary = '';
  private vatPos = { x: 0, y: 0, scale: 1 };

  constructor() {
    super(SceneKeys.Fry, 'Fry Station', 0x4a3a30, null);
  }

  protected override headerPosition(v: Viewport) {
    if (v.orientation === 'landscape') {
      // Keep the vat clear: put the header over the control panel.
      return { x: v.content.x + 1520, titleY: v.content.y + 55, subtitleY: v.content.y + 120 };
    }
    return super.headerPosition(v);
  }

  protected buildStation(): void {
    this.donuts = [];
    this.shownTemp = this.shownTarget = this.shownTimer = NaN;
    this.shownHint = null;
    this.shownPrimary = '';
    const fb = session().fryer.balance;

    this.vat = this.add.image(0, 0, TextureKeys.Fryer);
    for (let i = 0; i < MAX_DONUTS; i++) {
      this.donuts.push(this.add.image(0, 0, TextureKeys.DonutFry).setDisplaySize(DONUT_SIZE, DONUT_SIZE).setVisible(false));
    }
    this.grate = this.add.image(0, 0, TextureKeys.FryGrate);

    const golden: [number, number] = [(1 - fb.doneness.perfectWithin) / METER_MAX, (1 + fb.doneness.perfectWithin) / METER_MAX];
    this.underMeter = this.makeMeter('underside', golden, 0xf2c14e);
    this.topMeter = this.makeMeter('top', golden, 0xf2c14e);
    const span = fb.dial.maxF - fb.dial.minF;
    this.tempMeter = this.makeMeter('', [(fb.idealRangeF.min - fb.dial.minF) / span, (fb.idealRangeF.max - fb.dial.minF) / span], GOOD);
    this.oilMeter = this.makeMeter('oil', [0, fb.oil.lowThreshold], HOT, 0.35);

    const text = (size: number, color: string = CSS.cream, bold = true) =>
      this.add.text(0, 0, '', { fontFamily: FONT_FAMILY, fontSize: `${size}px`, fontStyle: bold ? 'bold' : 'normal', color });
    this.tempText = text(60).setOrigin(0, 0.5).setName('fry-temp');
    this.targetText = text(36, CSS.muted, false).setOrigin(0, 0.5);
    this.timerText = text(40).setOrigin(0, 0.5);
    this.hintText = text(38, CSS.cream, false).setOrigin(0.5).setAlign('center');
    this.resultText = text(64, CSS.ink)
      .setOrigin(0.5)
      .setAlign('center')
      .setBackgroundColor(CSS.cream)
      .setPadding(28, 18, 28, 18)
      .setDepth(20)
      .setVisible(false)
      .setName('fry-result');

    this.buildDial();

    this.grateButton = new HoldButton(this, 0, 0, 'Hold\ngrate', (held) => session().fryer.setGrate(held), 300, 150, 'btn-grate');
    this.flipButton = new Button(this, 0, 0, 'Flip', () => session().fryer.flip(), { width: 260, height: 150, name: 'btn-flip' });
    this.primaryButton = new Button(this, 0, 0, 'Drop donuts', () => this.primaryAction(), {
      width: 300,
      height: 150,
      fontSize: 46,
      name: 'btn-fry-primary',
    });
    this.oilButton = new Button(this, 0, 0, '+ oil', () => session().fryer.addOil(), {
      width: 200,
      height: 120,
      fontSize: 40,
      fill: COLORS.dough,
      name: 'btn-add-oil',
    });

    // Leaving the station lets go of the grate (you can't hold it from the Lobby).
    this.events.on(Phaser.Scenes.Events.SLEEP, () => this.grateButton.release());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.events.off(Phaser.Scenes.Events.SLEEP));
    listen(this, session().events, 'changed', () => this.refreshSubtitle());
    this.refreshSubtitle();
  }

  private makeMeter(label: string, band: [number, number], bandColor: number, bandAlpha = 0.9): Meter {
    return {
      label: this.add.text(0, 0, label, { fontFamily: FONT_FAMILY, fontSize: '36px', color: CSS.cream }).setOrigin(0, 0.5),
      bg: this.add.rectangle(0, 0, 1, 36, 0x2b2522).setOrigin(0, 0.5).setStrokeStyle(4, COLORS.ink),
      band: this.add.rectangle(0, 0, 1, 36, bandColor, bandAlpha).setOrigin(0, 0.5),
      fill: this.add.rectangle(0, 0, 1, 22, 0xffffff).setOrigin(0, 0.5),
      bandFrom: band[0],
      bandTo: band[1],
    };
  }

  private placeMeter(m: Meter, labelX: number, barX: number, barW: number, y: number): void {
    m.label.setPosition(labelX, y);
    m.bg.setPosition(barX, y).setSize(barW, 36);
    m.band.setPosition(barX + barW * m.bandFrom, y).setSize(barW * (m.bandTo - m.bandFrom), 36);
    m.fill.setPosition(barX, y).setSize(barW, 22);
  }

  private setMeter(m: Meter, fraction: number, color: number): void {
    m.fill.scaleX = Phaser.Math.Clamp(fraction, 0, 1);
    m.fill.fillColor = color;
  }

  private buildDial(): void {
    const fb = session().fryer.balance;
    const face = this.make.graphics({}, false);
    face.fillStyle(0x000000, 0.25);
    face.fillCircle(0, 8, DIAL_R);
    face.fillStyle(COLORS.cream);
    face.fillCircle(0, 0, DIAL_R);
    face.lineStyle(6, COLORS.ink);
    face.strokeCircle(0, 0, DIAL_R);
    // Ideal range arc. Phaser angles: 0 = 3 o'clock, clockwise; our dial angle 0 = 12 o'clock.
    const toRad = (f: number) => Phaser.Math.DegToRad(this.dialAngleFor(f, fb.dial.minF, fb.dial.maxF) - 90);
    face.lineStyle(16, GOOD);
    face.beginPath();
    face.arc(0, 0, DIAL_R - 18, toRad(fb.idealRangeF.min), toRad(fb.idealRangeF.max));
    face.strokePath();
    face.lineStyle(4, COLORS.ink);
    for (let a = -DIAL_SWEEP; a <= DIAL_SWEEP; a += 27) {
      const r = Phaser.Math.DegToRad(a - 90);
      face.lineBetween(Math.cos(r) * (DIAL_R - 6), Math.sin(r) * (DIAL_R - 6), Math.cos(r) * (DIAL_R - 30), Math.sin(r) * (DIAL_R - 30));
    }
    const cold = this.make.text({ x: -DIAL_R * 0.7, y: DIAL_R + 28, text: 'low', style: { fontFamily: FONT_FAMILY, fontSize: '30px', color: CSS.cream } }, false).setOrigin(0.5);
    const hot = this.make.text({ x: DIAL_R * 0.7, y: DIAL_R + 28, text: 'high', style: { fontFamily: FONT_FAMILY, fontSize: '30px', color: CSS.cream } }, false).setOrigin(0.5);

    const needleBar = this.add.rectangle(0, 0, 14, DIAL_R - 30, HOT).setOrigin(0.5, 1);
    const hub = this.add.circle(0, 0, 18, COLORS.ink);
    this.needle = this.add.container(0, 0, [needleBar]);
    const hit = this.add.zone(0, 0, DIAL_R * 2.4, DIAL_R * 2.4).setName('fry-dial');
    hit.setInteractive(new Phaser.Geom.Circle(DIAL_R * 1.2, DIAL_R * 1.2, DIAL_R * 1.2), Phaser.Geom.Circle.Contains);
    this.dial = this.add.container(0, 0, [face, cold, hot, this.needle, hub, hit]);

    hit.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      this.draggingDial = true;
      this.setDialFromPointer(p);
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (this.draggingDial && p.isDown) this.setDialFromPointer(p);
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, () => (this.draggingDial = false));
  }

  private dialAngleFor(f: number, min: number, max: number): number {
    return -DIAL_SWEEP + ((f - min) / (max - min)) * DIAL_SWEEP * 2;
  }

  private setDialFromPointer(p: Phaser.Input.Pointer): void {
    const fb = session().fryer.balance;
    const angle = Phaser.Math.RadToDeg(Math.atan2(p.worldX - this.dial.x, -(p.worldY - this.dial.y)));
    const a = Phaser.Math.Clamp(angle, -DIAL_SWEEP, DIAL_SWEEP);
    const f = fb.dial.minF + ((a + DIAL_SWEEP) / (DIAL_SWEEP * 2)) * (fb.dial.maxF - fb.dial.minF);
    session().fryer.setTarget(Math.round(f / 5) * 5);
  }

  protected layoutStation(v: Viewport): void {
    const L = LAYOUT[v.orientation];
    const c = v.content;
    this.vatPos = { x: c.x + L.vat.x, y: c.y + L.vat.y, scale: L.vat.scale };
    this.vat.setPosition(this.vatPos.x, this.vatPos.y).setScale(L.vat.scale);
    this.grate.setScale(L.vat.scale);

    this.placeMeter(this.underMeter, c.x + L.meters.labelX, c.x + L.meters.barX, L.meters.barW, c.y + L.meters.y[0]);
    this.placeMeter(this.topMeter, c.x + L.meters.labelX, c.x + L.meters.barX, L.meters.barW, c.y + L.meters.y[1]);
    this.timerText.setPosition(c.x + L.timer.x, c.y + L.timer.y);

    this.dial.setPosition(c.x + L.dial.x, c.y + L.dial.y);
    this.tempText.setPosition(c.x + L.temp.x, c.y + L.temp.y);
    this.targetText.setPosition(c.x + L.temp.x, c.y + L.temp.y + 50);
    this.placeMeter(this.tempMeter, c.x + L.temp.x, c.x + L.temp.x, L.temp.barW, c.y + L.temp.barY);
    this.placeMeter(this.oilMeter, c.x + L.oil.labelX, c.x + L.oil.barX, L.oil.barW, c.y + L.oil.y);
    this.oilButton.setPosition(c.x + L.oil.buttonX, c.y + L.oil.y);

    const buttonScale = v.orientation === 'landscape' ? 0.88 : 1;
    this.grateButton.setPosition(c.x + L.buttons.x[0], c.y + L.buttons.y).setScale(buttonScale);
    this.flipButton.setPosition(c.x + L.buttons.x[1], c.y + L.buttons.y).setScale(buttonScale);
    this.primaryButton.setPosition(c.x + L.buttons.x[2], c.y + L.buttons.y).setScale(buttonScale);
    this.hintText.setPosition(c.x + L.hint.x, c.y + L.hint.y);
    this.resultText.setPosition(this.vatPos.x, this.vatPos.y);
  }

  // ---- Per frame: render the fryer. Keep this allocation-free. ---------------

  override update(): void {
    const s = session();
    const f = s.fryer;
    const fb = f.balance;
    const batch = f.batch;

    // Temperature
    const t = Math.round(f.temp);
    if (t !== this.shownTemp) {
      this.shownTemp = t;
      this.tempText.setText(`${t}°F`);
    }
    if (f.target !== this.shownTarget) {
      this.shownTarget = f.target;
      this.targetText.setText(`dial: ${f.target}°F`);
      this.needle.angle = this.dialAngleFor(f.target, fb.dial.minF, fb.dial.maxF);
    }
    const tempColor = f.temp < fb.idealRangeF.min ? COOL : f.temp > fb.idealRangeF.max ? HOT : GOOD;
    this.setMeter(this.tempMeter, (f.temp - fb.dial.minF) / (fb.dial.maxF - fb.dial.minF), tempColor);
    this.tempText.setColor(f.inIdealRange ? CSS.cream : f.temp < fb.idealRangeF.min ? '#9fd8ff' : '#ff9a8a');
    this.setMeter(this.oilMeter, f.oil, f.oilLow ? HOT : 0xd9a441);

    // Donuts in the oil: tint shows the side facing up.
    const sink = f.grateHeld ? 16 * this.vatPos.scale : 0;
    let underSum = 0;
    let topSum = 0;
    const count = batch ? Math.min(batch.count, MAX_DONUTS) : 0;
    const cols = count <= 3 ? Math.max(count, 1) : count <= 6 ? 3 : 4;
    const rows = Math.ceil(count / cols);
    const cellW = (640 * this.vatPos.scale) / cols;
    const cellH = (320 * this.vatPos.scale) / Math.max(rows, 1);
    const size = Math.min(DONUT_SIZE * this.vatPos.scale, cellW * 0.92, cellH * 0.92);
    for (let i = 0; i < MAX_DONUTS; i++) {
      const img = this.donuts[i]!;
      if (!batch || i >= count) {
        img.setVisible(false);
        continue;
      }
      const col = i % cols;
      const row = Math.floor(i / cols);
      img
        .setVisible(true)
        .setPosition(this.vatPos.x + (col - (cols - 1) / 2) * cellW, this.vatPos.y + (row - (rows - 1) / 2) * cellH + sink)
        .setDisplaySize(size, size)
        .setTint(fryColor(batch.up[i]!))
        .setAlpha(f.grateHeld ? 0.85 : 1);
      underSum += batch.down[i]!;
      topSum += batch.up[i]!;
    }
    this.grate.setPosition(this.vatPos.x, this.vatPos.y + (f.grateHeld ? sink : -20 * this.vatPos.scale)).setAlpha(batch ? 1 : 0.6);

    const under = count ? underSum / count : 0;
    const top = count ? topSum / count : 0;
    this.setMeter(this.underMeter, under / METER_MAX, fryColor(under));
    this.setMeter(this.topMeter, top / METER_MAX, fryColor(top));

    const secs = batch ? Math.floor(batch.seconds * 10) / 10 : -1;
    if (secs !== this.shownTimer) {
      this.shownTimer = secs;
      this.timerText.setText(batch ? `frying: ${secs.toFixed(1)}s` : '');
    }

    // Buttons
    this.grateButton.setEnabled(!!batch);
    this.flipButton.setEnabled(!!batch);
    this.oilButton.setEnabled(f.oil < 1);
    const primary = batch ? 'Pull!' : 'Drop donuts';
    if (primary !== this.shownPrimary) {
      this.shownPrimary = primary;
      this.primaryButton.setLabel(primary);
    }
    this.primaryButton.setEnabled(!!batch || s.canStartFrying);

    this.updateHint();
  }

  private updateHint(): void {
    const s = session();
    const f = s.fryer;
    const active = s.activeTicket;
    let key: HintKey;
    if (f.batch) {
      if (f.oilLow) key = 'oilLow';
      else if (f.temp < f.balance.idealRangeF.min) key = 'cool';
      else if (f.temp > f.balance.idealRangeF.max) key = 'hot';
      else key = 'cooking';
    } else if (!active) key = 'noTicket';
    else if (active.results.fry) key = 'alreadyFried';
    else if (f.oil < f.balance.oil.minToFry) key = 'noOil';
    else key = 'ready';
    if (key === this.shownHint) return;
    this.shownHint = key;
    const HINTS: Record<HintKey, string> = {
      noTicket: 'tap a ticket on the rail to start',
      alreadyFried: 'this order is already fried.\ntap another ticket on the rail',
      noOil: 'the vat is nearly empty: add oil',
      ready: 'drop the donuts when the oil is hot',
      oilLow: 'oil is low: frying unevenly!',
      cool: 'oil is cool: turn up the heat',
      hot: 'oil is too hot!',
      cooking: 'flip, or hold the grate to cook the top',
    };
    this.hintText.setText(HINTS[key]);
  }

  private refreshSubtitle(): void {
    const s = session();
    const frying = s.fryingTicket;
    const active = s.activeTicket;
    if (frying) {
      this.setSubtitle(`#${frying.no} in the fryer · ${frying.order.flavors.length} donuts`);
    } else if (!active) {
      this.setSubtitle('no ticket selected');
    } else if (active.results.fry) {
      this.setSubtitle(`#${active.no} fried · score ${active.results.fry.score}`);
    } else {
      const n = active.order.flavors.length;
      this.setSubtitle(`#${active.no} · ${n} donut${n === 1 ? '' : 's'} to fry`);
    }
  }

  private primaryAction(): void {
    const s = session();
    if (s.fryer.batch) this.showResult(s.pullFry());
    else if (s.canStartFrying) s.startFrying();
  }

  private showResult(r: FryResult): void {
    this.tweens.killTweensOf(this.resultText);
    this.resultText.setText(`#${r.ticketNo}  fry ${r.score}\n${fryVerdict(r.score)}`).setVisible(true).setAlpha(1);
    this.tweens.add({
      targets: this.resultText,
      alpha: 0,
      delay: 1800,
      duration: 500,
      onComplete: () => this.resultText.setVisible(false),
    });
  }
}
