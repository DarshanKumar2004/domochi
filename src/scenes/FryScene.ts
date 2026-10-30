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
const RACK_SHOWN = 6;
const DIAL_R = 120;
/** Dial sweep either side of 12 o'clock, in degrees. */
const DIAL_SWEEP = 135;
const DONUT_SIZE = 170;
/** Where the dough drops from, relative to the dispenser's centre (texture px). */
const NOZZLE = { x: -7, y: 82 };

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

/** Per-donut animation offsets layered on top of its slot position (tweened). */
interface DonutAnim {
  dx: number;
  dy: number;
  scale: number;
}

type HintKey = 'pickOrPrep' | 'fryOrRack' | 'ready' | 'noOil' | 'oilLow' | 'cool' | 'hot' | 'cooking';

/** Positions per orientation, relative to the content area. */
const LAYOUT = {
  portrait: {
    vat: { x: 540, y: 470, scale: 1.25 },
    dispenser: { x: 130, y: 205, scale: 0.8 },
    meters: { labelX: 60, barX: 300, barW: 720, y: [810, 870] },
    timer: { x: 60, y: 960 },
    rack: { labelX: 360, x: 470, y: 960, step: 60, size: 56, buttonX: 920 },
    dial: { x: 190, y: 1110 },
    temp: { x: 400, y: 1040, barY: 1128, barW: 620 },
    oil: { labelX: 400, barX: 480, barW: 320, y: 1232, buttonX: 930 },
    buttons: { y: 1450, x: [190, 540, 890], scale: 1 },
    hint: { x: 540, y: 1335 },
  },
  landscape: {
    vat: { x: 480, y: 300, scale: 0.95 },
    dispenser: { x: 140, y: 100, scale: 0.65 },
    meters: { labelX: 100, barX: 330, barW: 600, y: [560, 605] },
    timer: { x: 100, y: 655 },
    rack: { labelX: 100, x: 200, y: 722, step: 56, size: 50, buttonX: 640 },
    dial: { x: 1180, y: 360 },
    temp: { x: 1350, y: 270, barY: 360, barW: 500 },
    oil: { labelX: 1350, barX: 1430, barW: 260, y: 450, buttonX: 1800 },
    // Scaled to 0.88 in landscape so the row fits (still >= 120 px tall).
    buttons: { y: 680, x: [1170, 1440, 1720], scale: 0.88 },
    hint: { x: 1520, y: 572 },
  },
} as const;

export class FryScene extends StationScene {
  private vat!: Phaser.GameObjects.Image;
  private grate!: Phaser.GameObjects.Image;
  private dispenser!: Phaser.GameObjects.Image;
  private donuts: Phaser.GameObjects.Image[] = [];
  private donutAnims: DonutAnim[] = [];
  private underMeter!: Meter;
  private topMeter!: Meter;
  private tempMeter!: Meter;
  private oilMeter!: Meter;
  private tempText!: Phaser.GameObjects.Text;
  private targetText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private resultText!: Phaser.GameObjects.Text;
  private rackLabel!: Phaser.GameObjects.Text;
  private rackMinis: Phaser.GameObjects.Image[] = [];
  private rackMore!: Phaser.GameObjects.Text;
  private dial!: Phaser.GameObjects.Container;
  private needle!: Phaser.GameObjects.Container;
  private grateButton!: HoldButton;
  private flipButton!: Button;
  private primaryButton!: Button;
  private oilButton!: Button;
  private rackButton!: Button;

  private draggingDial = false;
  // Last-shown values, so update() only touches text when something changed.
  private shownTemp = NaN;
  private shownTarget = NaN;
  private shownTimer = NaN;
  private shownHint: HintKey | null = null;
  private shownPrimary = '';
  private vatPos = { x: 0, y: 0, scale: 1 };
  private rackPos = { x: 0, y: 0, step: 0, size: 0 };
  /** Reused by slotPosition() so the per-frame loop doesn't allocate. */
  private readonly slot = { x: 0, y: 0, size: 0 };

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
    this.donutAnims = [];
    this.rackMinis = [];
    this.shownTemp = this.shownTarget = this.shownTimer = NaN;
    this.shownHint = null;
    this.shownPrimary = '';
    const fb = session().fryer.balance;

    this.vat = this.add.image(0, 0, TextureKeys.Fryer);
    for (let i = 0; i < MAX_DONUTS; i++) {
      this.donuts.push(this.add.image(0, 0, TextureKeys.DonutFry).setVisible(false));
      this.donutAnims.push({ dx: 0, dy: 0, scale: 1 });
    }
    this.grate = this.add.image(0, 0, TextureKeys.FryGrate);
    this.dispenser = this.add.image(0, 0, TextureKeys.FryDispenser).setDepth(5);

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

    this.rackLabel = text(36, CSS.cream, false).setOrigin(0, 0.5).setName('fry-rack');
    for (let i = 0; i < RACK_SHOWN; i++) this.rackMinis.push(this.add.image(0, 0, TextureKeys.DonutFry).setVisible(false));
    this.rackMore = text(34).setOrigin(0, 0.5);

    this.buildDial();

    this.grateButton = new HoldButton(this, 0, 0, 'Hold\ngrate', (held) => session().fryer.setGrate(held), 300, 150, 'btn-grate');
    this.flipButton = new Button(this, 0, 0, 'Flip', () => session().fryer.flip(), { width: 260, height: 150, name: 'btn-flip' });
    this.primaryButton = new Button(this, 0, 0, 'Drop', () => this.primaryAction(), {
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
    this.rackButton = new Button(this, 0, 0, 'use rack', () => this.useRack(), {
      width: 210,
      height: 120,
      fontSize: 36,
      fill: COLORS.dough,
      name: 'btn-use-rack',
    });

    // Leaving the station lets go of the grate (you can't hold it from the Lobby).
    this.events.on(Phaser.Scenes.Events.SLEEP, () => this.grateButton.release());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.events.off(Phaser.Scenes.Events.SLEEP));
    listen(this, session().events, 'changed', () => this.refresh());
    this.refresh();
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
    const labelStyle = { fontFamily: FONT_FAMILY, fontSize: '30px', color: CSS.cream };
    const cold = this.make.text({ x: -DIAL_R * 0.7, y: DIAL_R + 28, text: 'low', style: labelStyle }, false).setOrigin(0.5);
    const hot = this.make.text({ x: DIAL_R * 0.7, y: DIAL_R + 28, text: 'high', style: labelStyle }, false).setOrigin(0.5);

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
    this.dispenser.setPosition(c.x + L.dispenser.x, c.y + L.dispenser.y).setScale(L.dispenser.scale);

    this.placeMeter(this.underMeter, c.x + L.meters.labelX, c.x + L.meters.barX, L.meters.barW, c.y + L.meters.y[0]);
    this.placeMeter(this.topMeter, c.x + L.meters.labelX, c.x + L.meters.barX, L.meters.barW, c.y + L.meters.y[1]);
    this.timerText.setPosition(c.x + L.timer.x, c.y + L.timer.y);

    this.rackPos = { x: c.x + L.rack.x, y: c.y + L.rack.y, step: L.rack.step, size: L.rack.size };
    this.rackLabel.setPosition(c.x + L.rack.labelX, c.y + L.rack.y);
    this.rackMinis.forEach((m, i) => m.setPosition(this.rackPos.x + i * L.rack.step, this.rackPos.y).setDisplaySize(L.rack.size, L.rack.size));
    this.rackMore.setPosition(this.rackPos.x + RACK_SHOWN * L.rack.step - L.rack.size / 2, c.y + L.rack.y);
    this.rackButton.setPosition(c.x + L.rack.buttonX, c.y + L.rack.y).setScale(L.buttons.scale);

    this.dial.setPosition(c.x + L.dial.x, c.y + L.dial.y);
    this.tempText.setPosition(c.x + L.temp.x, c.y + L.temp.y);
    this.targetText.setPosition(c.x + L.temp.x, c.y + L.temp.y + 50);
    this.placeMeter(this.tempMeter, c.x + L.temp.x, c.x + L.temp.x, L.temp.barW, c.y + L.temp.barY);
    this.placeMeter(this.oilMeter, c.x + L.oil.labelX, c.x + L.oil.barX, L.oil.barW, c.y + L.oil.y);
    this.oilButton.setPosition(c.x + L.oil.buttonX, c.y + L.oil.y).setScale(L.buttons.scale);

    this.grateButton.setPosition(c.x + L.buttons.x[0], c.y + L.buttons.y).setScale(L.buttons.scale);
    this.flipButton.setPosition(c.x + L.buttons.x[1], c.y + L.buttons.y).setScale(L.buttons.scale);
    this.primaryButton.setPosition(c.x + L.buttons.x[2], c.y + L.buttons.y).setScale(L.buttons.scale);
    this.hintText.setPosition(c.x + L.hint.x, c.y + L.hint.y);
    this.resultText.setPosition(this.vatPos.x, this.vatPos.y);
  }

  /** Centre and size of donut slot i in a batch of `count` (written into this.slot). */
  private slotPosition(i: number, count: number): { x: number; y: number; size: number } {
    const cols = count <= 3 ? Math.max(count, 1) : count <= 6 ? 3 : 4;
    const rows = Math.ceil(count / cols);
    const cellW = (640 * this.vatPos.scale) / cols;
    const cellH = (320 * this.vatPos.scale) / Math.max(rows, 1);
    this.slot.x = this.vatPos.x + ((i % cols) - (cols - 1) / 2) * cellW;
    this.slot.y = this.vatPos.y + (Math.floor(i / cols) - (rows - 1) / 2) * cellH;
    this.slot.size = Math.min(DONUT_SIZE * this.vatPos.scale, cellW * 0.92, cellH * 0.92);
    return this.slot;
  }

  private get nozzle(): { x: number; y: number } {
    return { x: this.dispenser.x + NOZZLE.x * this.dispenser.scale, y: this.dispenser.y + NOZZLE.y * this.dispenser.scale };
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

    // Donuts in the oil: tint shows the side facing up; anim offsets come from the drop tween.
    const sink = f.grateHeld ? 16 * this.vatPos.scale : 0;
    let underSum = 0;
    let topSum = 0;
    const count = batch ? Math.min(batch.count, MAX_DONUTS) : 0;
    for (let i = 0; i < MAX_DONUTS; i++) {
      const img = this.donuts[i]!;
      if (!batch || i >= count) {
        img.setVisible(false);
        continue;
      }
      const slot = this.slotPosition(i, count);
      const anim = this.donutAnims[i]!;
      const size = slot.size * anim.scale;
      img
        .setVisible(true)
        .setPosition(slot.x + anim.dx, slot.y + anim.dy + sink)
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
    this.primaryButton.setEnabled(!!batch || s.canStartFrying);
    this.updatePrimaryLabel();
    this.updateHint();
  }

  private updatePrimaryLabel(): void {
    const s = session();
    let label: string;
    if (s.fryer.batch) label = 'Pull!';
    else {
      const next = s.nextDrop;
      label = next.ticketNo === null ? `Prep ${next.count}` : `Drop #${next.ticketNo}`;
    }
    if (label !== this.shownPrimary) {
      this.shownPrimary = label;
      this.primaryButton.setLabel(label);
    }
  }

  private updateHint(): void {
    const s = session();
    const f = s.fryer;
    let key: HintKey;
    if (f.batch) {
      if (f.oilLow) key = 'oilLow';
      else if (f.temp < f.balance.idealRangeF.min) key = 'cool';
      else if (f.temp > f.balance.idealRangeF.max) key = 'hot';
      else key = 'cooking';
    } else if (f.oil < f.balance.oil.minToFry) key = 'noOil';
    else if (s.canUseRack) key = 'fryOrRack';
    else if (s.nextDrop.ticketNo === null) key = 'pickOrPrep';
    else key = 'ready';
    if (key === this.shownHint) return;
    this.shownHint = key;
    const HINTS: Record<HintKey, string> = {
      pickOrPrep: 'no order to fry: prep a batch for the rack',
      fryOrRack: 'drop fresh donuts, or use the rack',
      ready: 'drop the donuts when the oil is hot',
      noOil: 'the vat is nearly empty: add oil',
      oilLow: 'oil is low: frying unevenly!',
      cool: 'oil is cool: turn up the heat',
      hot: 'oil is too hot!',
      cooking: 'flip, or hold the grate to cook the top',
    };
    this.hintText.setText(HINTS[key]);
  }

  /** Subtitle, rack row and rack button: on session changes only. */
  private refresh(): void {
    const s = session();
    const f = s.fryer;
    const frying = s.fryingTicket;
    const active = s.activeTicket;
    if (f.batch && !frying) {
      this.setSubtitle(`prep batch in the fryer · ${f.batch.count} donuts`);
    } else if (frying) {
      this.setSubtitle(`#${frying.no} in the fryer · ${frying.order.flavors.length} donuts`);
    } else if (!active) {
      this.setSubtitle('no ticket selected');
    } else if (active.results.fry) {
      this.setSubtitle(`#${active.no} fried · score ${active.results.fry.score}`);
    } else {
      const n = active.order.flavors.length;
      this.setSubtitle(`#${active.no} · ${n} donut${n === 1 ? '' : 's'} to fry`);
    }

    const rack = s.rack;
    this.rackLabel.setText(rack.length ? 'rack' : 'rack: empty');
    this.rackMinis.forEach((m, i) => {
      const d = rack[i];
      m.setVisible(!!d);
      if (d) m.setTint(fryColor((d.a + d.b) / 2));
    });
    this.rackMore.setText(rack.length > RACK_SHOWN ? `+${rack.length - RACK_SHOWN}` : '');
    this.rackButton.setVisible(s.canUseRack);
  }

  // ---- Actions & animation ---------------------------------------------------

  private primaryAction(): void {
    const s = session();
    if (s.fryer.batch) {
      this.pullAnimation(s.fryer.batch.ticketNo === null);
      this.showResult(s.pullFry());
    } else if (s.canStartFrying) {
      const drop = s.startFrying();
      this.dropAnimation(drop.count);
    }
  }

  private useRack(): void {
    const s = session();
    if (!s.canUseRack) return;
    const r = s.useRack();
    this.showResult(r);
  }

  /** Donuts plop out of the depositor one by one and bounce into the oil. */
  private dropAnimation(count: number): void {
    const from = this.nozzle;
    for (let i = 0; i < Math.min(count, MAX_DONUTS); i++) {
      const slot = this.slotPosition(i, count);
      const anim = this.donutAnims[i]!;
      this.tweens.killTweensOf(anim);
      anim.dx = from.x - slot.x;
      anim.dy = from.y - slot.y;
      anim.scale = 0.3;
      const landX = slot.x;
      const landY = slot.y;
      const size = slot.size;
      this.tweens.add({
        targets: anim,
        dx: 0,
        dy: 0,
        scale: 1,
        delay: i * 170,
        duration: 600,
        ease: 'Bounce.Out',
        onStart: () => this.squeeze(),
        onComplete: () => this.splash(landX, landY, size),
      });
    }
  }

  /** The depositor squishes a little as each ring drops out. */
  private squeeze(): void {
    const base = this.dispenser.scaleY;
    this.tweens.add({ targets: this.dispenser, scaleY: base * 0.9, duration: 80, yoyo: true });
  }

  private splash(x: number, y: number, size: number): void {
    const ring = this.add.circle(x, y, size * 0.45).setStrokeStyle(8, 0xfff0c2).setDepth(4);
    ring.isFilled = false;
    this.tweens.add({ targets: ring, scale: 1.5, alpha: 0, duration: 450, onComplete: () => ring.destroy() });
  }

  /** Lift the donuts out: prep batches fly onto the rack, orders lift up and away. */
  private pullAnimation(toRack: boolean): void {
    const batch = session().fryer.batch;
    if (!batch) return;
    const count = Math.min(batch.count, MAX_DONUTS);
    const rackStart = session().rack.length;
    for (let i = 0; i < count; i++) {
      const src = this.donuts[i]!;
      const ghost = this.add
        .image(src.x, src.y, TextureKeys.DonutFry)
        .setDisplaySize(src.displayWidth, src.displayHeight)
        .setTint(fryColor((batch.up[i]! + batch.down[i]!) / 2))
        .setDepth(15);
      const rackIndex = Math.min(rackStart + i, RACK_SHOWN - 1);
      const target = toRack
        ? { x: this.rackPos.x + rackIndex * this.rackPos.step, y: this.rackPos.y, displayWidth: this.rackPos.size, displayHeight: this.rackPos.size }
        : { y: src.y - 260, alpha: 0 };
      this.tweens.add({
        targets: ghost,
        ...target,
        delay: i * 70,
        duration: 520,
        ease: 'Cubic.InOut',
        onComplete: () => ghost.destroy(),
      });
    }
  }

  private showResult(r: FryResult): void {
    this.tweens.killTweensOf(this.resultText);
    const who = r.ticketNo === null ? 'prep batch → rack' : `#${r.ticketNo}  fry ${r.score}`;
    this.resultText.setText(`${who}\n${fryVerdict(r.score)}`).setVisible(true).setAlpha(1);
    this.tweens.add({
      targets: this.resultText,
      alpha: 0,
      delay: 1800,
      duration: 500,
      onComplete: () => this.resultText.setVisible(false),
    });
  }
}
