import Phaser from 'phaser';
import { TextureKeys } from '../assets/keys';
import { fryColor } from '../stations/fry';
import { audio, balance, session } from '../systems/services';
import { Button } from '../ui/Button';
import { HoldButton } from '../ui/HoldButton';
import type { Viewport } from '../ui/layout';
import { COLORS, CSS, FONT_FAMILY } from '../ui/theme';
import { listen } from './listen';
import { SceneKeys } from './sceneKeys';
import { StationScene } from './StationScene';

/** Doneness shown on the per-donut meters goes 0 → METER_MAX (golden = 1). */
const METER_MAX = 1.5;
const RACK_SHOWN = 6;
/** Steam puff pool size (golden cues and ready-to-pull steam). */
const STEAM = 24;
/** While both sides are golden, a wisp of steam rises this often (ms). */
const STEAM_EVERY_MS = 380;
/** Two taps on the trash can this close together (ms) empty the rack. */
const DOUBLE_TAP_MS = 500;
const DIAL_R = 120;
/** Dial sweep either side of 12 o'clock, in degrees. */
const DIAL_SWEEP = 135;
const DONUT_SIZE = 170;
/** Where the dough drops from, relative to the dispenser's centre (texture px). */
const NOZZLE = { x: -7, y: 82 };
/** Slots are laid out 3 × 2 in the oil. */
const COLS = 3;
const ROWS = 2;

const COOL = 0x6ec6ff;
const HOT = 0xe85d4a;
const GOOD = 0x7fd1ae;
/** Side meter colours: raw, nearly there, perfect, overdone. */
const SIDE_RAW = 0xe0574f;
const SIDE_NEAR = 0xf0a23a;
const SIDE_PERFECT = 0x5cc46a;
const SIDE_OVER = 0x7a2a22;
/** Below this doneness a side is still raw (red); from here to the gold band it's nearly there (orange). */
const NEAR_FROM = 0.65;

/** A side's meter colour for its doneness. */
function sideColor(d: number, perfectWithin: number): number {
  if (d > 1 + perfectWithin) return SIDE_OVER;
  if (d >= 1 - perfectWithin) return SIDE_PERFECT;
  return d >= NEAR_FROM ? SIDE_NEAR : SIDE_RAW;
}

interface Meter {
  label: Phaser.GameObjects.Text;
  bg: Phaser.GameObjects.Rectangle;
  band: Phaser.GameObjects.Rectangle;
  fill: Phaser.GameObjects.Rectangle;
  bandFrom: number;
  bandTo: number;
}

/** One vat slot: the donut image, its little two-bar meter, and animation/drag state. */
interface SlotView {
  img: Phaser.GameObjects.Image;
  /** The underside peeking out below the donut, in its own colour (so a flip visibly swaps them). */
  rim: Phaser.GameObjects.Image;
  meterBg: Phaser.GameObjects.Rectangle;
  /** "bottom" / "top" next to the two bars. */
  underLabel: Phaser.GameObjects.Text;
  topLabel: Phaser.GameObjects.Text;
  /** Gold zone on the meter: when a bar ends inside it, that side is golden. */
  band: Phaser.GameObjects.Rectangle;
  under: Phaser.GameObjects.Rectangle;
  top: Phaser.GameObjects.Rectangle;
  /** Tweened animation offsets layered on the slot position. */
  dx: number;
  dy: number;
  scale: number;
  squash: number;
  /** A little hop when the side in the oil turns golden ("flip me" / "pull me"). */
  hop: number;
  /** Flip count when we last cued golden, so each side cues once. */
  cuedFlips: number;
  /** Next steam puff while both sides are golden (scene time, ms). */
  nextSteam: number;
  dragging: boolean;
  dragged: boolean;
  dragX: number;
  dragY: number;
}

type HintKey = 'empty' | 'noOil' | 'noDough' | 'filter' | 'rackFull' | 'oilLow' | 'drift' | 'cool' | 'hot' | 'cooking';

interface Area {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Positions per orientation, relative to the content area. */
const LAYOUT = {
  portrait: {
    vat: { x: 540, y: 470, scale: 1.25 },
    // Top right, so it doesn't cover the subtitle.
    dispenser: { x: 975, y: 250, scale: 0.8 },
    rack: { x: 40, y: 790, w: 760, h: 120, minisX: 190, step: 74, size: 64 },
    trash: { x: 940, y: 850, size: 140 },
    dial: { x: 190, y: 1075 },
    temp: { x: 400, y: 1000, barY: 1092, barW: 620 },
    oil: { labelX: 400, barX: 480, barW: 320, y: 1185, buttonX: 930 },
    buttons: { y: 1430, x: [190, 540, 890], scale: 1 },
    hint: { x: 540, y: 1310 },
  },
  landscape: {
    vat: { x: 480, y: 300, scale: 0.95 },
    dispenser: { x: 140, y: 100, scale: 0.65 },
    rack: { x: 40, y: 522, w: 650, h: 100, minisX: 190, step: 64, size: 56 },
    trash: { x: 800, y: 572, size: 110 },
    dial: { x: 1180, y: 330 },
    temp: { x: 1350, y: 250, barY: 335, barW: 500 },
    oil: { labelX: 1350, barX: 1430, barW: 260, y: 425, buttonX: 1800 },
    // Scaled to 0.88 in landscape so the row fits (still >= 120 px tall).
    buttons: { y: 680, x: [1170, 1440, 1720], scale: 0.88 },
    hint: { x: 1520, y: 545 },
  },
} as const;

export class FryScene extends StationScene {
  private vat!: Phaser.GameObjects.Image;
  private grate!: Phaser.GameObjects.Image;
  private dispenser!: Phaser.GameObjects.Image;
  private trashBin!: Phaser.GameObjects.Image;
  private rackTray!: Phaser.GameObjects.Graphics;
  /** Grab the rack itself (not a donut on it) to slide the whole rack into the trash. */
  private rackHandle!: Phaser.GameObjects.Zone;
  private rackOffset = { dx: 0, dy: 0 };
  private steam: Phaser.GameObjects.Arc[] = [];
  private nextSteamPuff = 0;
  private lastTrashTap = 0;
  private slotViews: SlotView[] = [];
  private tempMeter!: Meter;
  private oilMeter!: Meter;
  private tempText!: Phaser.GameObjects.Text;
  private targetText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private resultText!: Phaser.GameObjects.Text;
  private rackLabel!: Phaser.GameObjects.Text;
  private rackMinis: Phaser.GameObjects.Image[] = [];
  private rackMore!: Phaser.GameObjects.Text;
  private dial!: Phaser.GameObjects.Container;
  private needle!: Phaser.GameObjects.Container;
  private idealArc!: Phaser.GameObjects.Graphics;
  private shownDrift = 0;
  private grateButton!: HoldButton;
  private dropButton!: Button;
  private pullAllButton!: Button;
  private oilButton!: Button;

  private draggingDial = false;
  // Last-shown values, so update() only touches text when something changed.
  private shownTemp = NaN;
  private shownTarget = NaN;
  private shownHint: HintKey | null = null;
  private vatPos = { x: 0, y: 0, scale: 1 };
  private dirtOverlay!: Phaser.GameObjects.Rectangle;
  private shownDirt = -1;
  private filterButton!: Button;
  private rackArea: Area = { x: 0, y: 0, w: 0, h: 0 };
  private rackMini = { x: 0, y: 0, step: 0, size: 0 };
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
    this.slotViews = [];
    this.rackMinis = [];
    this.shownTemp = this.shownTarget = NaN;
    this.shownDrift = 0;
    this.shownHint = null;
    const fb = session().fryer.balance;
    // A small movement threshold, so a tap flips instead of starting a drag.
    this.input.dragDistanceThreshold = 16;

    this.vat = this.add.image(0, 0, TextureKeys.Fryer);
    // Dirty oil darkens (filter it at closing).
    this.dirtOverlay = this.add.rectangle(0, 0, 1, 1, 0x4a2f14).setAlpha(0).setDepth(1);
    this.shownDirt = -1;
    this.rackTray = this.add.graphics();
    this.trashBin = this.add.image(0, 0, TextureKeys.TrashBin).setName('fry-trash');
    this.buildRackHandle();
    for (let i = 0; i < fb.slots; i++) this.slotViews.push(this.makeSlot(i));
    this.grate = this.add.image(0, 0, TextureKeys.FryGrate).setDepth(3);
    this.steam = [];
    for (let i = 0; i < STEAM; i++) this.steam.push(this.add.circle(0, 0, 20, 0xffffff, 0.8).setDepth(7).setVisible(false).setName('fry-steam'));
    this.dispenser = this.add.image(0, 0, TextureKeys.FryDispenser).setDepth(6);

    const span = fb.dial.maxF - fb.dial.minF;
    this.tempMeter = this.makeMeter('', [(fb.idealRangeF.min - fb.dial.minF) / span, (fb.idealRangeF.max - fb.dial.minF) / span], GOOD);
    this.oilMeter = this.makeMeter('oil', [0, fb.oil.lowThreshold], HOT, 0.35);

    const text = (size: number, color: string = CSS.cream, bold = true) =>
      this.add.text(0, 0, '', { fontFamily: FONT_FAMILY, fontSize: `${size}px`, fontStyle: bold ? 'bold' : 'normal', color });
    this.tempText = text(60).setOrigin(0, 0.5).setName('fry-temp');
    this.targetText = text(36, CSS.muted, false).setOrigin(0, 0.5);
    this.hintText = text(38, CSS.cream, false).setOrigin(0.5).setAlign('center');
    this.resultText = text(56, CSS.ink)
      .setOrigin(0.5)
      .setAlign('center')
      .setBackgroundColor(CSS.cream)
      .setPadding(28, 18, 28, 18)
      .setDepth(20)
      .setVisible(false)
      .setName('fry-result');

    this.rackLabel = text(36, CSS.cream, true).setOrigin(0, 0.5).setText('rack').setName('fry-rack');
    for (let i = 0; i < RACK_SHOWN; i++) this.rackMinis.push(this.makeRackMini(i));
    this.rackMore = text(34).setOrigin(0, 0.5);

    this.buildDial();

    this.grateButton = new HoldButton(this, 0, 0, 'Hold\ngrate', (held) => session().fryer.setGrate(held), 300, 150, 'btn-grate');
    this.dropButton = new Button(this, 0, 0, 'Drop', () => this.drop(), { width: 260, height: 150, fontSize: 52, name: 'btn-drop' });
    this.pullAllButton = new Button(this, 0, 0, 'Pull all', () => this.pullAll(), { width: 300, height: 150, fontSize: 48, name: 'btn-pull-all' });
    this.filterButton = new Button(this, 0, 0, 'Filter oil', () => this.filterOil(), { width: 300, height: 150, fontSize: 46, fill: COLORS.dough, name: 'btn-filter-oil' }).setVisible(false);
    this.oilButton = new Button(this, 0, 0, '+ oil', () => session().fryer.addOil(), {
      width: 200,
      height: 120,
      fontSize: 40,
      fill: COLORS.dough,
      name: 'btn-add-oil',
    });
    // Leaving the station lets go of the grate and any donut being dragged.
    this.events.on(Phaser.Scenes.Events.SLEEP, this.onSleep, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.events.off(Phaser.Scenes.Events.SLEEP, this.onSleep, this));
    listen(this, session().events, 'changed', () => this.refresh());
    listen(this, session().events, 'burnt', (e) => e.slots.forEach((s) => this.burnAnimation(s)));
    this.refresh();
  }

  private onSleep(): void {
    this.grateButton.release();
    for (const v of this.slotViews) v.dragging = false;
  }

  private makeSlot(i: number): SlotView {
    const img = this.add.image(0, 0, TextureKeys.DonutFry).setVisible(false).setName(`fry-donut-${i}`).setDepth(2);
    const meterLabel = (s: string) =>
      this.add
        .text(0, 0, s, { fontFamily: FONT_FAMILY, fontSize: '17px', fontStyle: 'bold', color: CSS.cream, backgroundColor: '#1f1a17dd', padding: { x: 5, y: 1 } })
        .setOrigin(1, 0.5)
        .setDepth(4)
        .setVisible(false);
    const view: SlotView = {
      img,
      rim: this.add.image(0, 0, TextureKeys.DonutFry).setVisible(false).setDepth(1.9),
      underLabel: meterLabel('bottom'),
      topLabel: meterLabel('top'),
      meterBg: this.add.rectangle(0, 0, 1, 30, 0x1f1a17, 0.85).setDepth(4).setVisible(false),
      band: this.add.rectangle(0, 0, 1, 30, SIDE_PERFECT, 0.35).setOrigin(0, 0.5).setDepth(4).setVisible(false),
      under: this.add.rectangle(0, 0, 1, 10, 0xffffff).setOrigin(0, 0.5).setDepth(4).setVisible(false),
      top: this.add.rectangle(0, 0, 1, 10, 0xffffff).setOrigin(0, 0.5).setDepth(4).setVisible(false),
      dx: 0,
      dy: 0,
      scale: 1,
      squash: 1,
      hop: 0,
      cuedFlips: -1,
      nextSteam: 0,
      dragging: false,
      dragged: false,
      dragX: 0,
      dragY: 0,
    };
    img.setInteractive({ draggable: true, useHandCursor: true });
    img.on(Phaser.Input.Events.POINTER_DOWN, () => (view.dragged = false));
    img.on(Phaser.Input.Events.DRAG_START, () => {
      view.dragging = true;
      view.dragged = true;
      img.setDepth(12);
    });
    img.on(Phaser.Input.Events.DRAG, (_p: Phaser.Input.Pointer, x: number, y: number) => {
      view.dragX = x;
      view.dragY = y;
    });
    img.on(Phaser.Input.Events.DRAG_END, (p: Phaser.Input.Pointer) => {
      view.dragging = false;
      img.setDepth(2);
      this.dropDragged(i, p.worldX, p.worldY);
    });
    img.on(Phaser.Input.Events.POINTER_UP, () => {
      if (!view.dragged) this.flip(i);
    });
    return view;
  }

  /**
   * The whole rack: drag it (by the tray, not a donut) into the trash, or
   * double-tap the trash can, to throw every rack donut away.
   */
  private buildRackHandle(): void {
    this.rackOffset = { dx: 0, dy: 0 };
    this.lastTrashTap = 0;
    this.rackHandle = this.add.zone(0, 0, 1, 1).setName('fry-rack-tray').setDepth(1);
    this.rackHandle.setInteractive({ draggable: true, useHandCursor: true });
    let from = { x: 0, y: 0 };
    this.rackHandle.on(Phaser.Input.Events.DRAG_START, () => {
      this.tweens.killTweensOf(this.rackOffset);
      from = { x: this.rackHandle.x, y: this.rackHandle.y };
    });
    this.rackHandle.on(Phaser.Input.Events.DRAG, (_p: Phaser.Input.Pointer, x: number, y: number) => {
      this.setRackOffset(x - from.x, y - from.y);
    });
    this.rackHandle.on(Phaser.Input.Events.DRAG_END, (p: Phaser.Input.Pointer) => {
      this.rackHandle.setPosition(from.x, from.y);
      if (this.overTrash(p.worldX, p.worldY) && session().rack.length) {
        this.trashWholeRack();
        this.setRackOffset(0, 0);
        return;
      }
      this.tweens.add({
        targets: this.rackOffset,
        dx: 0,
        dy: 0,
        duration: 220,
        ease: 'Back.Out',
        onUpdate: () => this.setRackOffset(this.rackOffset.dx, this.rackOffset.dy),
      });
    });

    this.trashBin.setInteractive({ useHandCursor: true });
    this.trashBin.on(Phaser.Input.Events.POINTER_DOWN, () => {
      // Wall-clock time of the tap, not the scene clock: that only moves once a frame, so a slow frame could split a quick double-tap.
      const now = performance.now();
      if (now - this.lastTrashTap < DOUBLE_TAP_MS) {
        this.lastTrashTap = 0;
        if (session().rack.length) this.trashWholeRack();
        else this.flash('the rack is already empty');
        return;
      }
      this.lastTrashTap = now;
    });
  }

  /** Shift the rack and everything on it while it's dragged. */
  private setRackOffset(dx: number, dy: number): void {
    this.rackOffset.dx = dx;
    this.rackOffset.dy = dy;
    this.rackTray.setPosition(dx, dy);
    const midY = this.rackMini.y + dy;
    this.rackLabel.setPosition(this.rackArea.x + 24 + dx, midY);
    this.rackMinis.forEach((m, i) => m.setPosition(this.rackMini.x + i * this.rackMini.step + dx, midY));
    this.rackMore.setPosition(this.rackMini.x + RACK_SHOWN * this.rackMini.step - this.rackMini.size / 2 + 4 + dx, midY);
  }

  private trashWholeRack(): void {
    const shown = this.rackMinis.filter((m) => m.visible).map((m) => ({ x: m.x, y: m.y, tint: m.tintTopLeft, size: m.displayWidth }));
    const n = session().trashRack();
    if (!n) return;
    audio().play('trash');
    shown.forEach((m, k) => this.ghost(m.x, m.y, m.tint, m.size, { x: this.trashBin.x, y: this.trashBin.y - 10, size: 20 }, k * 50));
    this.flash(`rack emptied (${n} donut${n === 1 ? '' : 's'})`);
  }

  /** A rack donut: drag it into the trash to throw just that one away. */
  private makeRackMini(i: number): Phaser.GameObjects.Image {
    const img = this.add.image(0, 0, TextureKeys.DonutFry).setVisible(false).setName(`fry-rack-${i}`).setDepth(5);
    img.setInteractive({ draggable: true, useHandCursor: true });
    img.on(Phaser.Input.Events.DRAG_START, () => img.setDepth(12));
    img.on(Phaser.Input.Events.DRAG, (_p: Phaser.Input.Pointer, x: number, y: number) => img.setPosition(x, y));
    img.on(Phaser.Input.Events.DRAG_END, (p: Phaser.Input.Pointer) => {
      img.setDepth(5);
      if (this.overTrash(p.worldX, p.worldY) && session().trashRackDonut(i)) {
        audio().play('trash');
        this.ghost(p.worldX, p.worldY, img.tintTopLeft, img.displayWidth, { x: this.trashBin.x, y: this.trashBin.y - 10, size: 20 });
      }
      const home = this.rackSpot(i);
      img.setPosition(home.x, home.y);
    });
    return img;
  }

  /** Is (x, y) over the trash can? Generous, so a quick fling still lands. */
  private overTrash(x: number, y: number): boolean {
    const bin = this.trashBin;
    return Phaser.Math.Distance.Between(x, y, bin.x, bin.y) < Math.max(bin.displayWidth, 150);
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
    const face = this.make.graphics({}, false);
    face.fillStyle(0x000000, 0.25);
    face.fillCircle(0, 8, DIAL_R);
    face.fillStyle(COLORS.cream);
    face.fillCircle(0, 0, DIAL_R);
    face.lineStyle(6, COLORS.ink);
    face.strokeCircle(0, 0, DIAL_R);
    // Ideal range arc. Phaser angles: 0 = 3 o'clock, clockwise; our dial angle 0 = 12 o'clock.
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
    this.idealArc = this.make.graphics({}, false);
    this.dial = this.add.container(0, 0, [face, this.idealArc, cold, hot, this.needle, hub, hit]);
    this.drawIdealArc(0);

    hit.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      this.draggingDial = true;
      this.setDialFromPointer(p);
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (this.draggingDial && p.isDown) this.setDialFromPointer(p);
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, () => (this.draggingDial = false));
  }

  /**
   * The green arc marks dial settings that give ideal oil. Low oil runs hotter
   * (settleTemp = dial + drift), so the arc slides down by the drift: pointing
   * the needle at green always means the oil will settle in the ideal range.
   */
  private drawIdealArc(drift: number): void {
    const fb = session().fryer.balance;
    const lo = Phaser.Math.Clamp(fb.idealRangeF.min - drift, fb.dial.minF, fb.dial.maxF);
    const hi = Phaser.Math.Clamp(fb.idealRangeF.max - drift, fb.dial.minF, fb.dial.maxF);
    // Phaser angles: 0 = 3 o'clock, clockwise; our dial angle 0 = 12 o'clock.
    const toRad = (f: number) => Phaser.Math.DegToRad(this.dialAngleFor(f, fb.dial.minF, fb.dial.maxF) - 90);
    this.idealArc.clear();
    if (hi <= lo) return;
    this.idealArc.lineStyle(16, GOOD);
    this.idealArc.beginPath();
    this.idealArc.arc(0, 0, DIAL_R - 18, toRad(lo), toRad(hi));
    this.idealArc.strokePath();
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
    this.dirtOverlay.setPosition(this.vatPos.x, this.vatPos.y).setSize(600 * L.vat.scale, 290 * L.vat.scale);
    this.grate.setScale(L.vat.scale);
    this.dispenser.setPosition(c.x + L.dispenser.x, c.y + L.dispenser.y).setScale(L.dispenser.scale);

    this.rackArea = { x: c.x + L.rack.x, y: c.y + L.rack.y, w: L.rack.w, h: L.rack.h };
    const ra = this.rackArea;
    this.rackTray.clear();
    this.rackTray.fillStyle(0x2b2522);
    this.rackTray.fillRoundedRect(ra.x, ra.y, ra.w, ra.h, 18);
    this.rackTray.lineStyle(4, 0x9aa3ab);
    for (let x = ra.x + 130; x < ra.x + ra.w - 10; x += 26) this.rackTray.lineBetween(x, ra.y + 12, x, ra.y + ra.h - 12);
    this.rackTray.lineStyle(5, COLORS.ink);
    this.rackTray.strokeRoundedRect(ra.x, ra.y, ra.w, ra.h, 18);
    const midY = ra.y + ra.h / 2;
    this.rackLabel.setPosition(ra.x + 24, midY);
    this.rackHandle.setPosition(ra.x + ra.w / 2, ra.y + ra.h / 2).setSize(ra.w, ra.h);
    this.rackTray.setPosition(0, 0);
    this.rackOffset = { dx: 0, dy: 0 };
    this.rackMini = { x: c.x + L.rack.minisX, y: midY, step: L.rack.step, size: L.rack.size };
    this.rackMinis.forEach((m, i) => m.setPosition(this.rackMini.x + i * L.rack.step, midY).setDisplaySize(L.rack.size, L.rack.size));
    this.rackMore.setPosition(this.rackMini.x + RACK_SHOWN * L.rack.step - L.rack.size / 2 + 4, midY);
    this.trashBin.setPosition(c.x + L.trash.x, c.y + L.trash.y).setDisplaySize(L.trash.size, L.trash.size);

    this.dial.setPosition(c.x + L.dial.x, c.y + L.dial.y);
    this.tempText.setPosition(c.x + L.temp.x, c.y + L.temp.y);
    this.targetText.setPosition(c.x + L.temp.x, c.y + L.temp.y + 48);
    this.placeMeter(this.tempMeter, c.x + L.temp.x, c.x + L.temp.x, L.temp.barW, c.y + L.temp.barY);
    this.placeMeter(this.oilMeter, c.x + L.oil.labelX, c.x + L.oil.barX, L.oil.barW, c.y + L.oil.y);
    this.oilButton.setPosition(c.x + L.oil.buttonX, c.y + L.oil.y).setScale(L.buttons.scale);

    this.grateButton.setPosition(c.x + L.buttons.x[0], c.y + L.buttons.y).setScale(L.buttons.scale);
    this.dropButton.setPosition(c.x + L.buttons.x[1], c.y + L.buttons.y).setScale(L.buttons.scale);
    this.pullAllButton.setPosition(c.x + L.buttons.x[2], c.y + L.buttons.y).setScale(L.buttons.scale);
    this.filterButton.setPosition(c.x + L.buttons.x[2], c.y + L.buttons.y).setScale(L.buttons.scale);
    this.hintText.setPosition(c.x + L.hint.x, c.y + L.hint.y);
    this.resultText.setPosition(this.vatPos.x, this.vatPos.y);
  }

  /** Centre and size of vat slot i (written into this.slot, no allocation). */
  private slotPosition(i: number): { x: number; y: number; size: number } {
    const cellW = (640 * this.vatPos.scale) / COLS;
    const cellH = (320 * this.vatPos.scale) / ROWS;
    this.slot.x = this.vatPos.x + ((i % COLS) - (COLS - 1) / 2) * cellW;
    this.slot.y = this.vatPos.y + (Math.floor(i / COLS) - (ROWS - 1) / 2) * cellH - 8 * this.vatPos.scale;
    this.slot.size = Math.min(DONUT_SIZE * this.vatPos.scale, cellW * 0.9, cellH * 0.92);
    return this.slot;
  }

  private get nozzle(): { x: number; y: number } {
    return { x: this.dispenser.x + NOZZLE.x * this.dispenser.scale, y: this.dispenser.y + NOZZLE.y * this.dispenser.scale };
  }

  // ---- Per frame: render the fryer. Keep this allocation-free. ---------------

  override update(time: number): void {
    const s = session();
    const f = s.fryer;
    const fb = f.balance;

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
    // Redraw the green arc when the drift moves by 5°F or more.
    const drift = Math.round((f.settleTemp - f.target) / 5) * 5;
    if (drift !== this.shownDrift) {
      this.shownDrift = drift;
      this.drawIdealArc(drift);
    }
    const tempColor = f.temp < fb.idealRangeF.min ? COOL : f.temp > fb.idealRangeF.max ? HOT : GOOD;
    this.setMeter(this.tempMeter, (f.temp - fb.dial.minF) / (fb.dial.maxF - fb.dial.minF), tempColor);
    this.tempText.setColor(f.inIdealRange ? CSS.cream : f.temp < fb.idealRangeF.min ? '#9fd8ff' : '#ff9a8a');
    this.setMeter(this.oilMeter, f.oil, f.oilLow ? HOT : 0xd9a441);

    // Donuts: tint shows the side facing up; each has a little underside/top meter.
    const sink = f.grateHeld ? 16 * this.vatPos.scale : 0;
    for (let i = 0; i < this.slotViews.length; i++) {
      const v = this.slotViews[i]!;
      const d = f.slots[i];
      if (!d) {
        v.img.setVisible(false);
        v.rim.setVisible(false);
        v.underLabel.setVisible(false);
        v.topLabel.setVisible(false);
        v.meterBg.setVisible(false);
        v.band.setVisible(false);
        v.under.setVisible(false);
        v.top.setVisible(false);
        v.cuedFlips = -1;
        v.hop = 0;
        continue;
      }
      const slot = this.slotPosition(i);
      const size = slot.size * v.scale;
      const x = v.dragging ? v.dragX : slot.x + v.dx;
      const y = v.dragging ? v.dragY : slot.y + v.dy + sink - v.hop;

      // Golden cues: the side in the oil turning golden makes the donut hop with a puff
      // of steam (time to flip, or to pull); golden on both sides keeps it steaming (ready to pull).
      const pwCue = fb.doneness.perfectWithin;
      const downGold = Math.abs(d.down - 1) <= pwCue;
      if (!v.dragging && downGold && v.cuedFlips !== d.flips) {
        v.cuedFlips = d.flips;
        this.goldenHop(v, x, y, size);
      }
      // Ready to pull: the side in the oil is golden and the top is at least golden (it keeps
      // cooking a little while it floats, so it may be just past the band by now).
      if (!v.dragging && downGold && d.up >= 1 - pwCue && time >= v.nextSteam) {
        v.nextSteam = time + STEAM_EVERY_MS;
        this.puff(x + (Math.random() - 0.5) * size * 0.4, y - size * 0.2, size * 0.24);
      }
      v.img
        .setVisible(true)
        .setPosition(x, y)
        .setDisplaySize(size, size * v.squash)
        .setTint(fryColor(d.up))
        .setAlpha(f.grateHeld && !v.dragging ? 0.85 : 1);
      // The underside shows as a rim below the donut, in its own colour.
      v.rim
        .setVisible(v.squash > 0.5)
        .setPosition(x, y + size * 0.08 * v.squash)
        .setDisplaySize(size, size * v.squash)
        .setTint(fryColor(d.down))
        .setAlpha(v.img.alpha);

      const mw = slot.size * 0.95;
      const my = slot.y + slot.size * 0.5 + 2;
      const showMeter = !v.dragging && v.scale > 0.95;
      v.meterBg.setVisible(showMeter).setPosition(slot.x, my).setSize(mw + 10, 30);
      const pw = fb.doneness.perfectWithin;
      v.band
        .setVisible(showMeter)
        .setPosition(slot.x - mw / 2 + (mw * (1 - pw)) / METER_MAX, my)
        .setSize((mw * 2 * pw) / METER_MAX, 30);
      v.under
        .setVisible(showMeter)
        .setPosition(slot.x - mw / 2, my - 7)
        .setSize(mw * Math.min(d.down / METER_MAX, 1), 10);
      v.under.fillColor = sideColor(d.down, pw);
      v.underLabel.setVisible(showMeter).setPosition(slot.x - mw / 2 - 2, my - 8);
      v.top
        .setVisible(showMeter)
        .setPosition(slot.x - mw / 2, my + 7)
        .setSize(mw * Math.min(d.up / METER_MAX, 1), 10);
      v.top.fillColor = sideColor(d.up, pw);
      v.topLabel.setVisible(showMeter).setPosition(slot.x - mw / 2 - 2, my + 9);
    }
    this.grate.setPosition(this.vatPos.x, this.vatPos.y + (f.grateHeld ? sink : -20 * this.vatPos.scale)).setAlpha(f.count ? 1 : 0.6);

    // Buttons
    this.grateButton.setEnabled(f.count > 0);
    this.dropButton.setEnabled(f.canDrop && s.dough >= 1);
    // With the vat empty and the oil dirty, "Pull all" makes way for "Filter oil".
    const filter = f.count === 0 && s.oilDirt > 0;
    this.pullAllButton.setVisible(!filter).setEnabled(f.count > 0 && !s.rackFull);
    this.filterButton.setVisible(filter);
    const dirt = Math.min(1, s.oilDirt / balance.cleanup.oilDirtMax);
    if (dirt !== this.shownDirt) {
      this.shownDirt = dirt;
      this.dirtOverlay.setAlpha(dirt * 0.45);
    }
    this.oilButton.setEnabled(f.oil < 1);
    this.updateHint();
  }

  private updateHint(): void {
    const s = session();
    const f = s.fryer;
    const fb = f.balance;
    let key: HintKey;
    if (f.oil < fb.oil.minToFry) key = 'noOil';
    else if (f.count === 0 && s.phase === 'closing' && s.oilDirt > 0) key = 'filter';
    else if (f.count === 0 && s.dough < 1) key = 'noDough';
    else if (f.count === 0) key = s.rackFull ? 'rackFull' : 'empty';
    else if (s.rackFull) key = 'rackFull';
    else if (f.oilLow) key = 'oilLow';
    else if (f.temp > fb.idealRangeF.max && f.oil < 0.95 && f.settleTemp > f.target + 5) key = 'drift';
    else if (f.temp < fb.idealRangeF.min) key = 'cool';
    else if (f.temp > fb.idealRangeF.max) key = 'hot';
    else key = 'cooking';
    if (key === this.shownHint) return;
    this.shownHint = key;
    const HINTS: Record<HintKey, string> = {
      empty: 'drop donuts in one at a time',
      noOil: 'the vat is nearly empty: add oil',
      noDough: 'out of dough! make a batch at the Dough station',
      filter: 'closing time: filter the oil',
      rackFull: 'the rack is full: glaze some,\nor double-tap the trash to empty it',
      oilLow: 'oil is low: frying unevenly!',
      drift: 'less oil runs hotter: dial it back down',
      cool: 'oil is cool: turn up the heat',
      hot: 'oil is too hot!',
      cooking: 'tap a donut to flip it · drag it to the rack',
    };
    this.hintText.setText(HINTS[key]);
  }

  /** Subtitle, rack row and rack button: on session changes only. */
  private refresh(): void {
    const s = session();
    const dough = Number.isFinite(s.dough) ? ` · dough ${s.dough}` : '';
    this.setSubtitle(`rack ${s.rack.length}/${s.fryer.balance.rackCapacity} · ${s.fryer.count} frying${dough}`);

    const rack = s.rack;
    this.rackMinis.forEach((m, i) => {
      const d = rack[i];
      m.setVisible(!!d);
      if (d) m.setTint(fryColor((d.a + d.b) / 2));
    });
    this.rackMore.setText(rack.length > RACK_SHOWN ? `+${rack.length - RACK_SHOWN}` : '');
  }

  // ---- Actions ---------------------------------------------------------------

  private drop(): void {
    const slot = session().dropDonut();
    if (slot >= 0) {
      this.dropAnimation(slot);
      audio().play('drop');
    }
  }

  private flip(slot: number): void {
    if (!session().flipDonut(slot)) return;
    audio().play('flip');
    const v = this.slotViews[slot]!;
    this.tweens.killTweensOf(v);
    v.hop = 0;
    v.squash = 1;
    this.tweens.add({ targets: v, squash: 0.15, duration: 110, yoyo: true, ease: 'Sine.InOut' });
  }

  /** A donut was let go after dragging: onto the rack, into the trash, or back to its slot. */
  private dropDragged(slot: number, x: number, y: number): void {
    const v = this.slotViews[slot]!;
    const ra = this.rackArea;
    const pad = 30;
    const overRack = x >= ra.x - pad && x <= ra.x + ra.w + pad && y >= ra.y - pad && y <= ra.y + ra.h + pad;
    const bin = this.trashBin;
    const overTrash = this.overTrash(x, y);
    const s = session();
    const tint = fryColor(s.fryer.slots[slot]?.up ?? 0);

    if (overTrash && s.trashDonut(slot)) {
      this.ghost(x, y, tint, v.img.displayWidth, { x: bin.x, y: bin.y - 10, size: 20 });
      audio().play('trash');
      return;
    }
    if (overRack) {
      const rackIndex = Math.min(s.rack.length, RACK_SHOWN - 1);
      if (s.pullDonut(slot)) {
        this.ghost(x, y, tint, v.img.displayWidth, this.rackSpot(rackIndex));
        return;
      }
      this.flash('the rack is full!');
    }
    // Back to its slot.
    const home = this.slotPosition(slot);
    v.dx = x - home.x;
    v.dy = y - home.y;
    this.tweens.add({ targets: v, dx: 0, dy: 0, duration: 220, ease: 'Back.Out' });
  }

  /** Filter the oil: it drains and comes back clean. */
  private filterOil(): void {
    const s = session();
    if (!s.oilDirt) return;
    audio().play('pour');
    this.tweens.add({ targets: this.dirtOverlay, alpha: 0, duration: 600 });
    this.time.delayedCall(300, () => audio().play('ding'));
    s.filterOil();
    this.flash('oil filtered: nice and clean');
  }

  private pullAll(): void {
    const s = session();
    const before = s.rack.length;
    const tints = s.fryer.slots.map((d) => (d ? fryColor((d.up + d.down) / 2) : 0));
    const taken = s.pullAll();
    taken.forEach((slot, k) => {
      const v = this.slotViews[slot]!;
      const from = this.slotPosition(slot);
      this.ghost(from.x, from.y, tints[slot]!, v.img.displayWidth, this.rackSpot(Math.min(before + k, RACK_SHOWN - 1)), k * 70);
    });
  }

  private rackSpot(index: number): { x: number; y: number; size: number } {
    return { x: this.rackMini.x + index * this.rackMini.step, y: this.rackMini.y, size: this.rackMini.size };
  }

  // ---- Animation -------------------------------------------------------------

  /** The donut plops out of the depositor and bounces into its slot. */
  private dropAnimation(slot: number): void {
    const from = this.nozzle;
    const home = this.slotPosition(slot);
    const v = this.slotViews[slot]!;
    const landX = home.x;
    const landY = home.y;
    const size = home.size;
    this.tweens.killTweensOf(v);
    v.hop = 0;
    v.dx = from.x - home.x;
    v.dy = from.y - home.y;
    v.scale = 0.3;
    v.squash = 1;
    this.squeeze();
    this.tweens.add({
      targets: v,
      dx: 0,
      dy: 0,
      scale: 1,
      duration: 600,
      ease: 'Bounce.Out',
      onComplete: () => this.splash(landX, landY, size),
    });
  }

  /** The donut hops in the oil with a puff of steam: this side is golden. */
  private goldenHop(v: SlotView, x: number, y: number, size: number): void {
    audio().play('ding');
    this.tweens.add({ targets: v, hop: size * 0.18, duration: 130, yoyo: true, ease: 'Sine.Out' });
    for (let k = 0; k < 3; k++) this.puff(x + (k - 1) * size * 0.3, y - size * 0.1, size * 0.28);
  }

  /** A wisp of steam rising and fading (pooled). */
  private puff(x: number, y: number, r: number): void {
    const p = this.steam[this.nextSteamPuff]!;
    this.nextSteamPuff = (this.nextSteamPuff + 1) % STEAM;
    this.tweens.killTweensOf(p);
    p.setPosition(x, y).setRadius(r).setScale(0.6).setAlpha(0.85).setVisible(true);
    this.tweens.add({
      targets: p,
      y: y - r * 5,
      scale: 1.6,
      alpha: 0,
      duration: 750,
      ease: 'Sine.Out',
      onComplete: () => p.setVisible(false),
    });
  }

  /** The depositor squishes a little as a ring drops out. */
  private squeeze(): void {
    const base = this.dispenser.scaleY;
    this.tweens.add({ targets: this.dispenser, scaleY: base * 0.9, duration: 80, yoyo: true });
  }

  private splash(x: number, y: number, size: number): void {
    const ring = this.add.circle(x, y, size * 0.45).setStrokeStyle(8, 0xfff0c2).setDepth(4);
    ring.isFilled = false;
    this.tweens.add({ targets: ring, scale: 1.5, alpha: 0, duration: 450, onComplete: () => ring.destroy() });
  }

  /** A burnt donut: puff of smoke, then it flies into the trash. */
  private burnAnimation(slot: number): void {
    audio().play('burn');
    const home = this.slotPosition(slot);
    const x = home.x;
    const y = home.y;
    for (let k = 0; k < 3; k++) {
      const puff = this.add.circle(x + (k - 1) * 30, y, 30, 0x555555, 0.7).setDepth(14);
      this.tweens.add({ targets: puff, y: y - 140, scale: 2.2, alpha: 0, delay: k * 90, duration: 700, onComplete: () => puff.destroy() });
    }
    this.ghost(x, y, fryColor(2), home.size, { x: this.trashBin.x, y: this.trashBin.y - 10, size: 20 }, 250);
    this.flash('burnt! into the trash');
  }

  /** A copy of a donut that flies somewhere and disappears. */
  private ghost(x: number, y: number, tint: number, size: number, to: { x: number; y: number; size: number }, delay = 0): void {
    const g = this.add.image(x, y, TextureKeys.DonutFry).setDisplaySize(size, size).setTint(tint).setDepth(15);
    this.tweens.add({
      targets: g,
      x: to.x,
      y: to.y,
      displayWidth: to.size,
      displayHeight: to.size,
      delay,
      duration: 480,
      ease: 'Cubic.InOut',
      onComplete: () => g.destroy(),
    });
  }

  private flash(text: string): void {
    this.tweens.killTweensOf(this.resultText);
    this.resultText.setText(text).setVisible(true).setAlpha(1);
    this.tweens.add({ targets: this.resultText, alpha: 0, delay: 1200, duration: 400, onComplete: () => this.resultText.setVisible(false) });
  }
}
