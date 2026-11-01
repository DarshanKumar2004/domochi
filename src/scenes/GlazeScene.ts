import Phaser from 'phaser';
import { glazeStockId } from '../systems/supplies';
import { TextureKeys } from '../assets/keys';
import { ringBallCenters, ringBallRadius } from '../stations/donutGeometry';
import { paintOnPattern, type GlazeLayer, type GlazeWork, type PourCheck, topLayers } from '../stations/glaze';
import { ballAt } from '../stations/toppings';
import type { Glaze, Stripe } from '../systems/menu';
import { audio, balance, menu, save, session } from '../systems/services';
import { Button } from '../ui/Button';
import { hexToNumber } from '../ui/DonutIcon';
import {
  circlePoints,
  clipToRing,
  donutIcon,
  drawDashedPath,
  drawGlazeLayers,
  drawGlazeSegment,
  drawOnTray,
  drawTrayRect,
  fadeTray,
  fryTint,
  MESS_SIZE,
  pruneDonutIcons,
  TRAY_PAD,
  paintStaleMess,
  cupOutline,
} from '../ui/donutArt';
import type { Viewport } from '../ui/layout';
import { COLORS, CSS, FONT_FAMILY } from '../ui/theme';
import { TrayWiper } from '../ui/TrayWiper';
import { listen } from './listen';
import { SceneKeys } from './sceneKeys';
import { StationScene } from './StationScene';

/** Paint canvas resolution (px per side) for a donut on the tray. */
const CANVAS = 420;
/** How much of the tray's mess stays each time a new donut goes on it (the rest fades). */
const TRAY_KEEP = 0.55;
/** Drizzle guide when the base glaze isn't a drizzled flavour's: three stripes across. */
const GENERIC_STRIPES: readonly Stripe[] = [-0.6, 0, 0.6].map((y) => ({ x0: -Math.sqrt(0.64 - y * y), y0: y, x1: Math.sqrt(0.64 - y * y), y1: y }));
const SLOTS = 6;
/** How far above your finger the cup hovers while pouring (game px). */
const CUP_LIFT = 170;
/** Cup tilt while pouring (degrees; negative tips the spout down to the left). */
const TILT = -40;
/** Spout position relative to the cup texture's centre (see MANIFEST: spout ≈ (6, 26) of 150×160). */
const SPOUT = { x: -69, y: -54 };
/** Falling-drop ring buffer size (enough for fallMs at 60 fps with room to spare). */
const DROPS = 48;

interface CupView {
  glaze: Glaze;
  img: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  /** Day it unlocks (if it's still locked today: drawn as a dotted outline). */
  lockedUntil: number | null;
}

/** One falling drop of glaze: emitted at the spout, lands where the finger was. */
interface Drop {
  active: boolean;
  emitAt: number;
  /** Landing point in game coordinates. */
  x: number;
  y: number;
  stroke: number;
  glazeId: string;
  circle: Phaser.GameObjects.Arc;
}

/** One donut spot on the tray: the donut, its paint, its spill, its guides. */
interface BoardView {
  x: number;
  y: number;
  size: number;
  img: Phaser.GameObjects.Image;
  canvasKey: string;
  canvas: Phaser.Textures.CanvasTexture;
  paint: Phaser.GameObjects.Image;
  messKey: string;
  mess: Phaser.Textures.CanvasTexture;
  messImg: Phaser.GameObjects.Image;
  bubbles: Phaser.GameObjects.Graphics;
  guideBase: Phaser.GameObjects.Graphics;
  guideDrizzle: Phaser.GameObjects.Graphics;
  shownWork: GlazeWork | null;
  /** The drizzle stripes its guide shows (null: the generic ones). */
  guidePattern: readonly Stripe[] | null;
  lastLand: { stroke: number; nx: number; ny: number };
  dirty: boolean;
  messDirty: boolean;
}

const LAYOUT = {
  portrait: {
    tray: { x: 40, y: 230, w: 1000, h: 140, size: 110 },
    boards: { x: 540, y: 670, size: 360, dx: 200 },
    instruction: { x: 540, y: 984 },
    readout: { x: 540, y: 1026 },
    cups: { x: 540, y: 1128, step: 140, scale: 0.75 },
    shelf: { x: 40, y: 1268, w: 820, h: 120, size: 90 },
    trash: { x: 960, y: 1328, size: 130 },
    buttons: { y: 1478, redoX: 270, doneX: 800, scale: 1 },
  },
  landscape: {
    tray: { x: 1000, y: 160, w: 880, h: 120, size: 92 },
    boards: { x: 480, y: 362, size: 370, dx: 215 },
    instruction: { x: 480, y: 684 },
    readout: { x: 480, y: 730 },
    cups: { x: 1440, y: 380, step: 120, scale: 0.65 },
    shelf: { x: 1000, y: 510, w: 700, h: 110, size: 80 },
    trash: { x: 1800, y: 565, size: 110 },
    buttons: { y: 705, redoX: 1250, doneX: 1620, scale: 0.85 },
  },
} as const;

/**
 * Glazing, two donuts at a time. Fried donuts come from the rack (and glazed
 * ones can come back from the shelf for more); pick a cup and pour: the drop
 * lands on whichever donut is under it. Done sends every glazed donut on the
 * tray to the shelf; Redo throws away the one you last worked on.
 */
export class GlazeScene extends StationScene {
  private boards: BoardView[] = [];
  private boardTray!: Phaser.GameObjects.Graphics;
  private boardZone!: Phaser.GameObjects.Zone;
  /** A ring round the donut you're working on, when there are two. */
  private activeRing!: Phaser.GameObjects.Graphics;
  /** The spot Redo and the readout are about (the last one placed or poured on). */
  private active = 0;
  /** The finger that's pouring, read every frame (its events can go to the rail or tab bar if it strays there). */
  private pourPointer: Phaser.Input.Pointer | null = null;
  /** Scrubbing the empty tray (with no donut on it). */
  private wiper!: TrayWiper;
  private nextPourSound = 0;
  private trayBg!: Phaser.GameObjects.Graphics;
  private trayLabel!: Phaser.GameObjects.Text;
  private shelfLabel!: Phaser.GameObjects.Text;
  private trayImgs: Phaser.GameObjects.Image[] = [];
  private shelfImgs: Phaser.GameObjects.Image[] = [];
  private trash!: Phaser.GameObjects.Image;
  private cups: CupView[] = [];
  private cupHighlight!: Phaser.GameObjects.Graphics;
  /** Dotted outlines where locked cups will go. */
  private lockedCups!: Phaser.GameObjects.Graphics;
  private handCup!: Phaser.GameObjects.Image;
  private drops: Drop[] = [];
  private instruction!: Phaser.GameObjects.Text;
  private readout!: Phaser.GameObjects.Text;
  private flashText!: Phaser.GameObjects.Text;
  private redoButton!: Button;
  private doneButton!: Button;

  private trayPos = { x: 0, y: 0, step: 0, size: 0 };
  private shelfPos = { x: 0, y: 0, step: 0, size: 0 };
  private cupScale = 1;
  private selected: string | null = null;
  private pouring = false;
  private fingerX = 0;
  private fingerY = 0;
  private stroke = 0;
  private nextDrop = 0;

  constructor() {
    super(SceneKeys.Glaze, 'Glaze Station', 0x6b4a5a, null);
  }

  protected override headerPosition(v: Viewport) {
    if (v.orientation === 'landscape') return { x: v.content.x + 1440, titleY: v.content.y + 45, subtitleY: v.content.y + 100 };
    return super.headerPosition(v);
  }

  protected buildStation(): void {
    this.cups = [];
    this.trayImgs = [];
    this.shelfImgs = [];
    this.drops = [];
    this.boards = [];
    this.selected = null;
    this.pouring = false;
    this.active = 0;
    this.input.dragDistanceThreshold = 16;

    this.trayBg = this.add.graphics();
    const label = (s: string) => this.add.text(0, 0, s, { fontFamily: FONT_FAMILY, fontSize: '28px', fontStyle: 'bold', color: CSS.muted }).setOrigin(0.5).setAngle(-90);
    this.trayLabel = label('rack');
    this.shelfLabel = label('glazed');
    for (let i = 0; i < SLOTS; i++) this.trayImgs.push(this.makeTrayDonut(i));
    for (let i = 0; i < SLOTS; i++) this.shelfImgs.push(this.makeShelfDonut(i));
    this.trash = this.add.image(0, 0, TextureKeys.TrashBin).setName('glaze-trash');

    this.boardTray = this.add.graphics();
    const spots = session().glazeBoards.length;
    for (let i = 0; i < spots; i++) this.boards.push(this.makeBoard(i));
    // Mess left from before (not cleaned up yesterday, or before a reload) is still there, maybe moldy.
    const stale = session().messOn('glaze');
    if (stale > 0) {
      this.boards.forEach((b, i) => {
        paintStaleMess(b.mess.context, stale / this.boards.length, session().moldOn('glaze'), i + 1, ['#f4a6c0', '#c68a4e', '#efe7da', '#7a4a2a']);
        b.mess.refresh();
      });
    }
    this.activeRing = this.add.graphics();
    this.boardZone = this.add.zone(0, 0, 1, 1).setInteractive({ useHandCursor: true }).setName('glaze-board');

    // A cup for every glaze on the menu; ones not unlocked yet are dotted outlines.
    this.cupHighlight = this.add.graphics();
    this.lockedCups = this.add.graphics();
    const day = session().day;
    for (const glaze of menu.glazes) {
      const uses = menu.flavors.filter((f) => f.glaze === glaze.id || f.drizzle === glaze.id);
      if (!uses.length) continue;
      const unlock = Math.min(...uses.map((f) => f.unlockDay));
      // The tutorial teaches with any flavour, so everything is out for it.
      this.cups.push(this.makeCup(glaze, unlock > day && !session().isTutorial ? unlock : null));
    }

    for (let i = 0; i < DROPS; i++) {
      this.drops.push({ active: false, emitAt: 0, x: 0, y: 0, stroke: 0, glazeId: '', circle: this.add.circle(0, 0, 10, 0xffffff).setVisible(false).setDepth(19) });
    }
    this.handCup = this.add.image(0, 0, TextureKeys.GlazeCup).setVisible(false).setDepth(20);

    const text = (size: number, color: string, bold = false) =>
      this.add.text(0, 0, '', { fontFamily: FONT_FAMILY, fontSize: `${size}px`, fontStyle: bold ? 'bold' : 'normal', color, align: 'center' }).setOrigin(0.5);
    this.instruction = text(42, CSS.cream, true).setName('glaze-instruction');
    this.readout = text(34, CSS.muted);
    this.flashText = text(48, CSS.ink, true).setBackgroundColor(CSS.cream).setPadding(24, 14, 24, 14).setDepth(30).setVisible(false).setName('glaze-flash');

    this.redoButton = new Button(this, 0, 0, 'Redo', () => this.redo(), { width: 320, fill: COLORS.danger, name: 'btn-glaze-redo' });
    this.doneButton = new Button(this, 0, 0, 'Done', () => this.done(), { width: 360, name: 'btn-glaze-done' });

    this.boardZone.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => this.startPour(p));
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      this.fingerX = p.worldX;
      this.fingerY = p.worldY;
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, () => this.stopPour());
    this.wiper = new TrayWiper(
      this,
      'glaze',
      () => this.boards.map((b) => b.mess),
      () => this.boards,
      () => {
        audio().play('ding');
        this.flash('sparkling clean!');
        this.refresh();
      },
      // Picking up the sponge puts the cup down.
      () => {
        this.selected = null;
        this.refreshControls();
      },
    );
    this.events.on(Phaser.Scenes.Events.SLEEP, this.stopPour, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.SLEEP, this.stopPour, this);
      for (const b of this.boards) {
        if (this.textures.exists(b.canvasKey)) this.textures.remove(b.canvasKey);
        if (this.textures.exists(b.messKey)) this.textures.remove(b.messKey);
      }
    });
    listen(this, session().events, 'changed', () => this.refresh());
  }

  // ---- Building blocks -----------------------------------------------------------

  private makeBoard(i: number): BoardView {
    const canvasKey = `glaze-paint-${i}`;
    const messKey = `glaze-mess-${i}`;
    for (const k of [canvasKey, messKey]) if (this.textures.exists(k)) this.textures.remove(k);
    const mess = this.textures.createCanvas(messKey, MESS_SIZE, MESS_SIZE)!;
    const messImg = this.add.image(0, 0, messKey);
    const img = this.add.image(0, 0, TextureKeys.DonutFry).setName(i === 0 ? 'glaze-donut' : `glaze-donut-${i}`).setVisible(false);
    const canvas = this.textures.createCanvas(canvasKey, CANVAS, CANVAS)!;
    const paint = this.add.image(0, 0, canvasKey).setVisible(false);
    return {
      x: 0,
      y: 0,
      size: 1,
      img,
      canvasKey,
      canvas,
      paint,
      messKey,
      mess,
      messImg,
      bubbles: this.add.graphics(),
      guideBase: this.add.graphics().setName('glaze-guide-base'),
      guideDrizzle: this.add.graphics().setName('glaze-guide-drizzle'),
      shownWork: null,
      guidePattern: null,
      lastLand: { stroke: -1, nx: 0, ny: 0 },
      dirty: false,
      messDirty: false,
    };
  }

  private makeTrayDonut(i: number): Phaser.GameObjects.Image {
    const img = this.add.image(0, 0, TextureKeys.DonutFry).setVisible(false).setName(`glaze-tray-${i}`).setDepth(5);
    img.setInteractive({ draggable: true, useHandCursor: true });
    let dragged = false;
    img.on(Phaser.Input.Events.POINTER_DOWN, () => (dragged = false));
    img.on(Phaser.Input.Events.DRAG_START, () => {
      dragged = true;
      img.setDepth(25);
    });
    img.on(Phaser.Input.Events.DRAG, (_p: Phaser.Input.Pointer, x: number, y: number) => img.setPosition(x, y));
    img.on(Phaser.Input.Events.DRAG_END, (p: Phaser.Input.Pointer) => {
      img.setDepth(5);
      if (this.overTrash(p.worldX, p.worldY)) {
        const ghost = this.ghostOf(img);
        if (session().trashRackDonut(i)) this.toTrash(p.worldX, p.worldY, ghost, true);
        else ghost.destroy();
      } else if (this.overTray(p.worldX, p.worldY)) {
        this.place('rack', i, this.nearestFreeSpot(p.worldX, p.worldY));
      }
      this.refresh();
    });
    img.on(Phaser.Input.Events.POINTER_UP, () => {
      if (!dragged) this.place('rack', i);
    });
    return img;
  }

  /** A glazed donut on the shelf: drag it to the trash, or tap / drag it back onto the tray for more glaze. */
  private makeShelfDonut(i: number): Phaser.GameObjects.Image {
    const img = this.add.image(0, 0, TextureKeys.DonutFry).setVisible(false).setName(`glaze-shelf-${i}`).setDepth(5);
    img.setInteractive({ draggable: true, useHandCursor: true });
    let dragged = false;
    img.on(Phaser.Input.Events.POINTER_DOWN, () => (dragged = false));
    img.on(Phaser.Input.Events.DRAG_START, () => {
      dragged = true;
      img.setDepth(25);
    });
    img.on(Phaser.Input.Events.DRAG, (_p: Phaser.Input.Pointer, x: number, y: number) => img.setPosition(x, y));
    img.on(Phaser.Input.Events.DRAG_END, (p: Phaser.Input.Pointer) => {
      img.setDepth(5);
      if (this.overTrash(p.worldX, p.worldY)) {
        const ghost = this.ghostOf(img);
        if (session().trashShelfDonut(i)) this.toTrash(p.worldX, p.worldY, ghost, true);
        else ghost.destroy();
      } else if (this.overTray(p.worldX, p.worldY)) {
        this.place('shelf', i, this.nearestFreeSpot(p.worldX, p.worldY));
      }
      this.refresh();
    });
    img.on(Phaser.Input.Events.POINTER_UP, () => {
      if (!dragged) this.place('shelf', i);
    });
    return img;
  }

  private makeCup(glaze: Glaze, lockedUntil: number | null): CupView {
    const sifter = glaze.style === 'dust';
    const img = this.add.image(0, 0, sifter ? TextureKeys.SugarSifter : TextureKeys.GlazeCup).setName(`cup-${glaze.id}`);
    if (!sifter) img.setTint(hexToNumber(glaze.color));
    if (lockedUntil === null) {
      img.setInteractive({ useHandCursor: true });
      img.on(Phaser.Input.Events.POINTER_DOWN, () => this.select(glaze.id));
    } else {
      img.setVisible(false);
    }
    const name = glaze.name.replace(/ glaze$/, '');
    const label = this.add
      .text(0, 0, lockedUntil === null ? name : '', {
        fontFamily: FONT_FAMILY,
        fontSize: '24px',
        color: lockedUntil === null ? CSS.cream : CSS.muted,
        align: 'center',
        wordWrap: { width: 160 },
      })
      .setOrigin(0.5, 0);
    return { glaze, img, label, lockedUntil };
  }

  protected layoutStation(v: Viewport): void {
    const L = LAYOUT[v.orientation];
    const c = v.content;
    const B = L.boards;
    const n = this.boards.length;
    this.boards.forEach((b, i) => {
      b.x = c.x + B.x + (i - (n - 1) / 2) * 2 * B.dx;
      b.y = c.y + B.y;
      b.size = B.size;
      b.img.setPosition(b.x, b.y).setDisplaySize(b.size, b.size);
      b.paint.setPosition(b.x, b.y).setDisplaySize(b.size, b.size);
      b.messImg.setPosition(b.x, b.y).setDisplaySize(b.size * (1 + 2 * TRAY_PAD), b.size * (1 + 2 * TRAY_PAD));
      b.shownWork = null; // force a canvas redraw at the new size
      b.guidePattern = null;
      this.drawBaseGuide(b);
      this.drawDrizzleGuide(b, GENERIC_STRIPES);
      this.drawBubbles(b);
    });
    // One wide tray under both spots; pouring is accepted anywhere on it.
    const trayW = (n - 1) * 2 * B.dx + B.size * (1 + 2 * TRAY_PAD);
    const trayH = B.size * (1 + 2 * TRAY_PAD);
    drawTrayRect(this.boardTray, c.x + B.x, c.y + B.y, trayW, trayH);
    this.boardZone.setPosition(c.x + B.x, c.y + B.y).setSize(trayW, trayH);
    this.wiper.placeIcon(c.x + B.x + trayW / 2 - 70, c.y + B.y - trayH / 2 + 50, 0.8);

    const t = L.tray;
    this.trayBg.clear();
    this.trayBg.fillStyle(0x2b2522);
    this.trayBg.fillRoundedRect(c.x + t.x, c.y + t.y, t.w, t.h, 18);
    this.trayBg.fillRoundedRect(c.x + L.shelf.x, c.y + L.shelf.y, L.shelf.w, L.shelf.h, 18);
    this.trayBg.lineStyle(5, COLORS.ink);
    this.trayBg.strokeRoundedRect(c.x + t.x, c.y + t.y, t.w, t.h, 18);
    this.trayBg.strokeRoundedRect(c.x + L.shelf.x, c.y + L.shelf.y, L.shelf.w, L.shelf.h, 18);
    this.trayPos = { x: c.x + t.x + 70 + t.size / 2, y: c.y + t.y + t.h / 2, step: Math.min(t.size * 1.35, (t.w - 160) / (SLOTS - 1)), size: t.size };
    this.shelfPos = {
      x: c.x + L.shelf.x + 70 + L.shelf.size / 2,
      y: c.y + L.shelf.y + L.shelf.h / 2,
      step: Math.min(L.shelf.size * 1.3, (L.shelf.w - 160) / (SLOTS - 1)),
      size: L.shelf.size,
    };
    // Labels run up the left edge of each tray.
    this.trayLabel.setPosition(c.x + t.x + 30, c.y + t.y + t.h / 2);
    this.shelfLabel.setPosition(c.x + L.shelf.x + 30, c.y + L.shelf.y + L.shelf.h / 2);
    this.trash.setPosition(c.x + L.trash.x, c.y + L.trash.y).setDisplaySize(L.trash.size, L.trash.size);

    this.cupScale = L.cups.scale;
    const k = this.cups.length;
    this.lockedCups.clear();
    this.cups.forEach((cup, i) => {
      const cx = c.x + L.cups.x + (i - (k - 1) / 2) * L.cups.step;
      const cy = c.y + L.cups.y;
      cup.img.setPosition(cx, cy).setScale(L.cups.scale);
      cup.label.setPosition(cx, cy + 68 * L.cups.scale + 8).setScale(Math.min(1, L.cups.scale + 0.2));
      if (cup.lockedUntil !== null) {
        // A dotted cup where the next glaze will go (no name: it's a surprise).
        this.lockedCups.lineStyle(4, COLORS.cream, 0.45);
        for (const path of cupOutline(110 * L.cups.scale, 120 * L.cups.scale)) drawDashedPath(this.lockedCups, cx, cy, 1, path, 10, 8);
      }
    });
    this.handCup.setScale(1);

    this.instruction.setPosition(c.x + L.instruction.x, c.y + L.instruction.y);
    this.readout.setPosition(c.x + L.readout.x, c.y + L.readout.y);
    this.flashText.setPosition(c.x + B.x, c.y + B.y);
    this.redoButton.setPosition(c.x + L.buttons.redoX, c.y + L.buttons.y).setScale(L.buttons.scale);
    this.doneButton.setPosition(c.x + L.buttons.doneX, c.y + L.buttons.y).setScale(L.buttons.scale);
    this.refresh();
  }

  // ---- State → screen -----------------------------------------------------------

  private work(i: number): GlazeWork | null {
    return session().glazeBoards[i] ?? null;
  }

  private get anyWork(): boolean {
    return session().glazeBoards.some((w) => w);
  }

  private refresh(): void {
    const s = session();

    // Tray (rack donuts) and shelf (glazed donuts)
    this.trayImgs.forEach((img, i) => {
      const d = s.rack[i];
      img.setVisible(!!d);
      if (d) img.setPosition(this.trayPos.x + i * this.trayPos.step, this.trayPos.y).setDisplaySize(this.trayPos.size, this.trayPos.size).setTint(fryTint(d));
    });
    pruneDonutIcons(this);
    this.shelfImgs.forEach((img, i) => {
      const d = s.shelf[i];
      img.setVisible(!!d);
      if (d) {
        img.setTexture(donutIcon(this, d)).clearTint();
        img.setPosition(this.shelfPos.x + i * this.shelfPos.step, this.shelfPos.y).setDisplaySize(this.shelfPos.size, this.shelfPos.size);
      }
    });

    // The donuts on the tray
    this.boards.forEach((b, i) => {
      const w = this.work(i);
      b.img.setVisible(!!w);
      b.paint.setVisible(!!w);
      b.bubbles.setVisible(!!w);
      if (w) b.img.setTint(fryTint(w.fry));
      if (w !== b.shownWork) {
        b.shownWork = w;
        this.redrawCanvas(b, w);
      }
    });
    if (!this.work(this.active)) {
      const other = s.glazeBoards.findIndex((w) => w);
      if (other >= 0) this.active = other;
    }

    this.setSubtitle(`rack ${s.rack.length} · glazed shelf ${s.shelf.length}/${balance.glaze.shelfCapacity}`);
    const work = this.work(this.active);
    if (!this.anyWork) {
      if (s.phase === 'closing' && s.messOn('glaze') > 0) this.instruction.setText('closing time: scrub the tray clean');
      // Nothing on the menu needs glaze yet (just the beignet): its sugar goes on at Toppings.
      else if (!this.cups.some((c) => c.lockedUntil === null) && !s.isTutorial) this.instruction.setText('no glazes on the menu yet!\nbeignets go straight to Toppings for their sugar');
      else {
        const base = s.rack.length ? 'tap a donut on the rack (or two) to glaze it' : s.shelf.length ? 'no fried donuts: fry some first! (or tap a glazed one to touch it up)' : 'no fried donuts: fry some first!';
        const scrub = s.moldOn('glaze') > 0 ? '\nthe tray is moldy! scrub it clean first' : s.messOn('glaze') > balance.cleanup.messDoneAt ? '\n(or scrub the tray clean)' : '';
        this.instruction.setText(base + scrub);
      }
    } else if (!work?.hasGlaze) this.instruction.setText('pick a cup, then pour over the donut');
    else this.instruction.setText('add a drizzle, or tap Done');
    this.refreshControls();
  }

  private refreshControls(): void {
    const s = session();
    this.wiper?.refreshIcon();
    // Servings left under each cup (when supplies are counted).
    for (const cup of this.cups) {
      if (cup.lockedUntil !== null) continue;
      const n = s.stockOf(glazeStockId(cup.glaze.id));
      const name = cup.glaze.name.replace(/ glaze$/, '');
      cup.label.setText(Number.isFinite(n) ? `${name}\n${n} left` : name).setColor(n < 1 ? '#ff9b9b' : CSS.cream);
      cup.img.setAlpha(n < 1 ? 0.4 : 1);
    }
    const work = this.work(this.active);
    this.redoButton.setEnabled(this.anyWork);
    this.doneButton.setEnabled(s.glazeBoards.some((w) => w?.hasGlaze) && !s.shelfFull);

    this.cupHighlight.clear();
    const cup = this.cups.find((c) => c.glaze.id === this.selected);
    if (cup) {
      const w = 170 * this.cupScale;
      this.cupHighlight.lineStyle(7, COLORS.pink);
      this.cupHighlight.strokeRoundedRect(cup.img.x - w / 2, cup.img.y - 95 * this.cupScale, w, 260 * this.cupScale, 20);
    }

    // With two donuts on the tray, ring the one you're working on.
    this.activeRing.clear();
    const b = this.boards[this.active];
    if (b && work && s.glazeBoards.filter((w) => w).length > 1) {
      this.activeRing.lineStyle(6, COLORS.pink, 0.8);
      this.activeRing.strokeCircle(b.x, b.y, b.size * 0.53);
    }

    this.boards.forEach((bv, i) => this.refreshGuides(bv, this.work(i)));
    const layer = work?.currentLayer ?? work?.layers[work.layers.length - 1];
    if (!work) this.readout.setText('');
    else if (!layer) this.readout.setText(this.selected ? 'press on the donut to pour' : 'pick a cup');
    else if (layer.kind === 'drizzle') {
      const cover = this.patternCoverage(work);
      this.readout.setText(
        cover !== null ? `drizzle: ${Math.round(cover * 100)}% of the stripes` : `drizzle ${Math.round(layer.coverage * 100)}% · spill ${Math.round(layer.spill * 100)}%`,
      );
    } else this.readout.setText(`glaze ${Math.round(layer.coverage * 100)}% · spill ${Math.round(layer.spill * 100)}%`);
  }

  // ---- Pouring ----------------------------------------------------------------

  private toNorm(b: BoardView, x: number, y: number): { nx: number; ny: number } {
    return { nx: (x - b.x) / (b.size / 2), ny: (y - b.y) / (b.size / 2) };
  }

  /** The tray spot (empty or not) nearest (x, y). */
  private nearestSpot(x: number, y: number): number {
    let best = 0;
    let bestD = Infinity;
    this.boards.forEach((b, i) => {
      const d = Phaser.Math.Distance.Between(x, y, b.x, b.y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }

  /** The free spot nearest (x, y) (undefined: let the session pick). */
  private nearestFreeSpot(x: number, y: number): number | undefined {
    let best: number | undefined;
    let bestD = Infinity;
    this.boards.forEach((b, i) => {
      if (this.work(i)) return;
      const d = Phaser.Math.Distance.Between(x, y, b.x, b.y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }

  /** The cup that's picked (the tutorial checks it). */
  get selectedCup(): string | null {
    return this.selected;
  }

  /** Tap a cup to pick it up; tap it again to put it down (then a finger on the tray wipes it). */
  private select(glazeId: string): void {
    // Picking a cup puts the sponge down.
    if (this.wiper.holding) {
      this.wiper.holding = false;
      this.wiper.refreshIcon();
    }
    if (this.selected !== glazeId && session().stockOf(glazeStockId(glazeId)) < 1) {
      const g = menu.glazes.find((x) => x.id === glazeId);
      this.flash(`out of ${g?.name ?? 'that'}!\nbuy more at the store`);
      return;
    }
    this.selected = this.selected === glazeId ? null : glazeId;
    this.refreshControls();
  }

  private startPour(p: Phaser.Input.Pointer): void {
    // Sponge in hand: scrub.
    if (this.wiper.holding) {
      this.wiper.start(p);
      return;
    }
    if (!this.selected) {
      // No cup in hand. On a donut: you need a cup. On the bare tray: scrub it, if it's messy.
      const spot = this.nearestSpot(p.worldX, p.worldY);
      const b = this.boards[spot]!;
      const { nx, ny } = this.toNorm(b, p.worldX, p.worldY);
      const onDonut = !!this.work(spot) && Math.hypot(nx, ny) <= 1;
      if (onDonut) this.flash('pick a cup first!');
      else if (this.wiper.dirty) {
        this.wiper.start(p);
        this.flash('scrubbing the tray clean');
      } else if (!this.anyWork) this.flash(session().rack.length ? 'take a donut from the rack first' : 'fry some donuts first');
      else this.flash('pick a cup first!');
      this.refreshControls();
      return;
    }
    // Pouring works anywhere on the tray: on a donut it glazes it, on an empty spot it just makes a mess.
    const spot = this.nearestSpot(p.worldX, p.worldY);
    const work = this.work(spot);
    if (work) {
      this.active = spot;
      const check = work.canPour(this.selected);
      if (check !== 'ok') {
        this.flash(this.pourMessage(check));
        this.refreshControls();
        return;
      }
    }
    this.pouring = true;
    this.pourPointer = p;
    this.stroke++;
    this.fingerX = p.worldX;
    this.fingerY = p.worldY;
    const glaze = menu.glazes.find((g) => g.id === this.selected)!;
    const sifter = glaze.style === 'dust';
    this.handCup.setTexture(sifter ? TextureKeys.SugarSifter : TextureKeys.GlazeCup).setVisible(true);
    if (sifter) this.handCup.clearTint();
    else this.handCup.setTint(hexToNumber(glaze.color));
    this.tweens.killTweensOf(this.handCup);
    this.handCup.setAngle(0);
    this.tweens.add({ targets: this.handCup, angle: sifter ? 0 : TILT, duration: 120 });
    // The sifter shakes instead of tilting.
    if (sifter) this.tweens.add({ targets: this.handCup, angle: { from: -8, to: 8 }, duration: 70, yoyo: true, repeat: -1 });
    this.refreshControls();
  }

  private stopPour(): void {
    this.wiper?.stop();
    if (!this.pouring) return;
    this.pouring = false;
    this.pourPointer = null;
    this.tweens.killTweensOf(this.handCup);
    this.handCup.setVisible(false);
  }

  private pourMessage(_check: PourCheck): string {
    return "can't pour that";
  }

  /** Where the stream leaves the cup (above the finger). */
  private lipFor(x: number, y: number): { lx: number; ly: number } {
    return { lx: x, ly: y - CUP_LIFT };
  }

  override update(time: number): void {
    const fallMs = balance.glaze.fallMs;

    // Follow the pouring finger directly: if it strays over the ticket rail or tab
    // bar, those scenes get its move/up events, but the pointer itself is still current.
    this.wiper.update(time);
    const pp = this.pourPointer;
    if (this.pouring && pp) {
      if (!pp.isDown) this.stopPour();
      else {
        this.fingerX = pp.x;
        this.fingerY = pp.y;
      }
    }

    // While pouring, the cup follows the finger (spout right above it) and emits a drop each frame.
    if (this.pouring && this.selected) {
      const a = Phaser.Math.DegToRad(this.handCup.angle);
      const sx = SPOUT.x * Math.cos(a) - SPOUT.y * Math.sin(a);
      const sy = SPOUT.x * Math.sin(a) + SPOUT.y * Math.cos(a);
      const { lx, ly } = this.lipFor(this.fingerX, this.fingerY);
      this.handCup.setPosition(lx - sx, ly - sy);
      if (time >= this.nextPourSound) {
        this.nextPourSound = time + 150;
        audio().play(this.handCup.texture.key === TextureKeys.SugarSifter ? 'shake' : 'pour');
      }
      const d = this.drops[this.nextDrop]!;
      this.nextDrop = (this.nextDrop + 1) % DROPS;
      d.active = true;
      d.emitAt = time;
      d.x = this.fingerX;
      d.y = this.fingerY;
      d.stroke = this.stroke;
      d.glazeId = this.selected;
      const g = menu.glazes.find((x) => x.id === this.selected)!;
      // A thin stream for icing, a thick one for glaze, grains for sugar.
      d.circle.setFillStyle(hexToNumber(g.color)).setRadius(g.style === 'dust' ? 5 : g.style === 'drizzle' ? 7 : 15).setVisible(true);
    }

    // Drops fall (accelerating) and land after fallMs.
    for (const d of this.drops) {
      if (!d.active) continue;
      const t = (time - d.emitAt) / fallMs;
      if (t >= 1) {
        d.active = false;
        d.circle.setVisible(false);
        this.land(d);
        continue;
      }
      const { lx, ly } = this.lipFor(d.x, d.y);
      d.circle.setPosition(lx, ly + (d.y - ly) * t * t);
    }

    let changed = false;
    for (const b of this.boards) {
      if (b.dirty) {
        b.dirty = false;
        b.canvas.refresh();
        changed = true;
      }
      if (b.messDirty) {
        b.messDirty = false;
        b.mess.refresh();
        this.wiper.refreshIcon();
      }
    }
    if (changed) this.refreshControls();
  }

  /**
   * A drop lands on the tray spot under it: glaze along the path from the previous
   * drop there. On a donut it glazes it; on an empty spot it's all mess.
   */
  private land(d: Drop): void {
    const spot = this.nearestSpot(d.x, d.y);
    const work = this.work(spot);
    const b = this.boards[spot]!;
    const { nx, ny } = this.toNorm(b, d.x, d.y);
    const same = b.lastLand.stroke === d.stroke;
    const x0 = same ? b.lastLand.nx : nx;
    const y0 = same ? b.lastLand.ny : ny;
    b.lastLand.stroke = d.stroke;
    b.lastLand.nx = nx;
    b.lastLand.ny = ny;
    if (!work) {
      drawOnTray(b.mess.context, (m, size) => drawGlazeSegment(m, size, d.glazeId, x0, y0, nx, ny, d.stroke * 31 + Math.round(nx * 97)), false);
      session().addMess('glaze', 1);
      b.messDirty = true;
      return;
    }
    // A new layer (a glaze going on this donut) uses a serving; none left, nothing pours.
    const fresh = work.currentLayer?.glazeId !== d.glazeId;
    if (fresh && session().stockOf(glazeStockId(d.glazeId)) < 1) return;
    if (!work.pour(d.glazeId, x0, y0, nx, ny)) return;
    if (fresh) session().useSupply(glazeStockId(d.glazeId));
    const layer = work.currentLayer!;
    const seed = layer.segments.length;
    // On the donut: clipped to the balls. Whatever missed lands on the tray, and stays there.
    const ctx = b.canvas.context;
    ctx.save();
    clipToRing(ctx, CANVAS);
    drawGlazeSegment(ctx, CANVAS, d.glazeId, x0, y0, nx, ny, seed);
    ctx.restore();
    drawOnTray(b.mess.context, (m, size) => drawGlazeSegment(m, size, d.glazeId, x0, y0, nx, ny, seed));
    // Glaze that missed the donut is mess on the tray (to wipe at closing).
    if (ballAt(nx, ny, balance.glaze, balance.glaze.edgeMargin) < 0) session().addMess('glaze', 1);
    b.dirty = true;
    b.messDirty = true;
    if (layer.segments.length === 4) this.refresh(); // first glaze on this donut: update the instruction
  }

  // ---- Drawing ----------------------------------------------------------------

  private redrawCanvas(b: BoardView, work: GlazeWork | null): void {
    const ctx = b.canvas.context;
    ctx.clearRect(0, 0, CANVAS, CANVAS);
    if (work) {
      ctx.save();
      clipToRing(ctx, CANVAS);
      drawGlazeLayers(ctx, CANVAS, work.allLayers);
      ctx.restore();
    }
    b.canvas.refresh();
  }

  /** Two dashed loops round the ring (base coat). */
  private drawBaseGuide(b: BoardView): void {
    const half = b.size / 2;
    const r = balance.glaze.ringRadius;
    b.guideBase.clear();
    for (const rr of [r - 0.1, r + 0.1]) {
      b.guideBase.lineStyle(10, COLORS.ink, 0.25);
      drawDashedPath(b.guideBase, b.x, b.y, half, circlePoints(rr));
      b.guideBase.lineStyle(5, COLORS.cream, 0.9);
      drawDashedPath(b.guideBase, b.x, b.y, half, circlePoints(rr));
    }
  }

  private drawDrizzleGuide(b: BoardView, stripes: readonly Stripe[]): void {
    const g = b.guideDrizzle;
    g.clear();
    for (const s of stripes) {
      const pts = [
        { x: s.x0, y: s.y0 },
        { x: s.x1, y: s.y1 },
      ];
      g.lineStyle(8, COLORS.ink, 0.25);
      drawDashedPath(g, b.x, b.y, b.size / 2, pts, 14, 10);
      g.lineStyle(4, 0xffffff, 0.95);
      drawDashedPath(g, b.x, b.y, b.size / 2, pts, 14, 10);
    }
  }

  /**
   * The drizzle stripes for a donut: the shop's pattern for the flavour its
   * base glaze belongs to (strawberry, chocolate hazelnut, cookie butter), or
   * null if that flavour has no drizzle.
   */
  private patternFor(work: GlazeWork | null): readonly Stripe[] | null {
    if (!work) return null;
    let baseId: string | undefined;
    for (const l of work.layers) if (l.kind === 'base') baseId = l.glazeId;
    if (!baseId && work.currentLayer?.kind === 'base') baseId = work.currentLayer.glazeId;
    if (!baseId) return null;
    return menu.flavors.find((fl) => fl.glaze === baseId && fl.drizzlePattern)?.drizzlePattern ?? null;
  }

  /** A donut's showing drizzle layer (on top of its base coat), if any. */
  private drizzleLayer(work: GlazeWork | null): GlazeLayer | undefined {
    if (!work) return undefined;
    if (work.currentLayer?.kind === 'drizzle') return work.currentLayer;
    return topLayers(work.layers).drizzle;
  }

  /** How much of the flavour's stripes the drizzle covers (0–1), or null without a pattern. */
  private patternCoverage(work: GlazeWork | null): number | null {
    const pattern = this.patternFor(work);
    const d = this.drizzleLayer(work);
    if (!pattern) return null;
    return d ? paintOnPattern(d, pattern, balance.glaze).coverage : 0;
  }

  /** Show a donut's guide for the selected cup until that layer is done well enough. */
  private refreshGuides(b: BoardView, work: GlazeWork | null): void {
    const g = this.selected ? menu.glazes.find((x) => x.id === this.selected) : undefined;
    const gb = balance.glaze;
    const pattern = this.patternFor(work);
    if (pattern !== b.guidePattern) {
      b.guidePattern = pattern;
      this.drawDrizzleGuide(b, pattern ?? GENERIC_STRIPES);
    }
    let baseDone = false;
    if (work) {
      const isDone = (l: GlazeLayer | undefined) => !!l && l.kind === 'base' && l.style !== 'drizzle' && l.coverage >= gb.goodCoverage[l.style];
      for (const l of work.layers) baseDone ||= isDone(l);
      baseDone ||= isDone(work.currentLayer);
    }
    const cover = this.patternCoverage(work);
    const d = this.drizzleLayer(work);
    const drizzleDone = cover !== null ? cover >= gb.patternGoodCoverage : !!d && d.coverage >= gb.drizzleAmount.idealMin;
    b.guideBase.setVisible(!!work && !!g && g.style !== 'drizzle' && !baseDone && this.hasGuide('base'));
    b.guideDrizzle.setVisible(!!work && !!g && g.style === 'drizzle' && !drizzleDone && this.hasGuide(this.patternFlavor(work)));
  }

  /**
   * Guides are bought at the supply store ('base' for every base coat, a
   * flavour id for its drizzle stripes). The tutorial shows them all, and so
   * does a day that doesn't count supplies.
   */
  private hasGuide(id: string | null): boolean {
    const s = session();
    if (s.isTutorial || !s.tracksSupplies) return true;
    return !!id && save().data.guides.includes(id);
  }

  /** The flavour whose drizzle stripes this donut's base coat calls for, if any. */
  private patternFlavor(work: GlazeWork | null): string | null {
    if (!work) return null;
    let baseId: string | undefined;
    for (const l of work.layers) if (l.kind === 'base') baseId = l.glazeId;
    if (work.currentLayer?.kind === 'base') baseId = work.currentLayer.glazeId;
    return menu.flavors.find((fl) => fl.glaze === baseId && fl.drizzlePattern)?.id ?? null;
  }

  /** Outline and gloss on each of the 8 balls (same geometry as the glaze maths). */
  private drawBubbles(b: BoardView): void {
    const half = b.size / 2;
    const gb = balance.glaze;
    const r = ringBallRadius(gb.ringRadius, 8, gb.ballOverlap) * half;
    const g = b.bubbles;
    g.clear();
    for (const p of ringBallCenters(0, 0, gb.ringRadius)) {
      const cx = b.x + p.x * half;
      const cy = b.y + p.y * half;
      g.lineStyle(5, COLORS.ink, 0.35);
      g.strokeCircle(cx, cy, r);
      g.lineStyle(8, 0xffffff, 0.35);
      g.beginPath();
      g.arc(cx, cy, r * 0.62, Math.PI * 1.08, Math.PI * 1.42);
      g.strokePath();
    }
  }

  // ---- Actions ----------------------------------------------------------------

  /** Put a donut on the tray: from the rack (fried), or back from the shelf (to touch up its glaze). */
  private place(from: 'rack' | 'shelf', index: number, spot?: number): void {
    const s = session();
    if (!s.glazeBoards.includes(null)) {
      this.flash('the tray is full: finish (or redo) a donut first');
      return;
    }
    const img = (from === 'rack' ? this.trayImgs : this.shelfImgs)[index]!;
    const src = { x: img.x, y: img.y, size: img.displayWidth, key: img.texture.key, tint: img.isTinted ? img.tintTopLeft : null };
    const before = s.glazeBoards.slice();
    const w = from === 'rack' ? s.startGlazing(index, spot) : s.reglaze(index, spot);
    if (!w) return;
    const at = s.glazeBoards.findIndex((x, i) => x === w && before[i] !== w);
    const b = this.boards[at]!;
    this.active = at;
    // A new donut on the tray: the old mess under it fades a bit.
    fadeTray(b.mess.context, TRAY_KEEP);
    s.fadeMess('glaze', TRAY_KEEP);
    b.mess.refresh();
    // Slide it onto its spot.
    const ghost = this.add.image(src.x, src.y, src.key).setDisplaySize(src.size, src.size).setDepth(15);
    if (src.tint !== null) ghost.setTint(src.tint);
    b.img.setAlpha(0);
    b.paint.setAlpha(0);
    this.tweens.add({
      targets: ghost,
      x: b.x,
      y: b.y,
      displayWidth: b.size,
      displayHeight: b.size,
      duration: 280,
      ease: 'Cubic.Out',
      onComplete: () => {
        ghost.destroy();
        b.img.setAlpha(1);
        b.paint.setAlpha(1);
      },
    });
    this.refreshControls();
  }

  private redo(): void {
    const s = session();
    const spot = this.work(this.active) ? this.active : s.glazeBoards.findIndex((w) => w);
    if (spot < 0) return;
    this.stopPour();
    const b = this.boards[spot]!;
    const snap = this.add.image(b.x, b.y, TextureKeys.DonutFry).setDisplaySize(b.size, b.size).setTint(b.img.tintTopLeft).setDepth(15);
    s.trashGlazing(spot);
    this.toTrash(snap.x, snap.y, snap, true);
    this.flash('trashed: take another from the rack');
  }

  /** Every glazed donut on the tray goes to the shelf. */
  private done(): void {
    const s = session();
    this.stopPour();
    let sent = 0;
    for (let i = 0; i < this.boards.length; i++) {
      const w = this.work(i);
      if (!w?.hasGlaze) continue;
      const before = s.shelf.length;
      const d = s.finishGlazing(i);
      if (!d) {
        if (s.shelfFull) this.flash('the glazed shelf is full!');
        break;
      }
      sent++;
      const b = this.boards[i]!;
      const ghost = this.add.image(b.x, b.y, donutIcon(this, d)).setDisplaySize(b.size, b.size).setDepth(15);
      this.tweens.add({
        targets: ghost,
        x: this.shelfPos.x + before * this.shelfPos.step,
        y: this.shelfPos.y,
        displayWidth: this.shelfPos.size,
        displayHeight: this.shelfPos.size,
        delay: sent * 60,
        duration: 380,
        ease: 'Cubic.InOut',
        onComplete: () => ghost.destroy(),
      });
    }
  }

  /** A loose copy of an image (made before trashing, while it still shows the donut). */
  private ghostOf(img: Phaser.GameObjects.Image): Phaser.GameObjects.Image {
    const g = this.add.image(img.x, img.y, img.texture.key).setDisplaySize(img.displayWidth, img.displayHeight).setDepth(15);
    if (img.isTinted) g.setTint(img.tintTopLeft);
    return g;
  }

  private overTray(x: number, y: number): boolean {
    const z = this.boardZone;
    return Math.abs(x - z.x) < z.width / 2 + 20 && Math.abs(y - z.y) < z.height / 2 + 20;
  }

  private overTrash(x: number, y: number): boolean {
    return Phaser.Math.Distance.Between(x, y, this.trash.x, this.trash.y) < Math.max(this.trash.displayWidth, 150);
  }

  /** Fly a copy of a donut into the trash can. `owned` = destroy the passed image afterwards. */
  private toTrash(x: number, y: number, img: Phaser.GameObjects.Image, owned = false): void {
    audio().play('trash');
    const ghost = owned ? img : this.add.image(x, y, img.texture.key).setDisplaySize(img.displayWidth, img.displayHeight).setTint(img.tintTopLeft).setDepth(15);
    ghost.setPosition(x, y);
    this.tweens.add({
      targets: ghost,
      x: this.trash.x,
      y: this.trash.y - 10,
      displayWidth: 20,
      displayHeight: 20,
      duration: 380,
      ease: 'Cubic.In',
      onComplete: () => ghost.destroy(),
    });
  }

  private flash(text: string): void {
    this.tweens.killTweensOf(this.flashText);
    this.flashText.setText(text).setVisible(true).setAlpha(1);
    this.tweens.add({ targets: this.flashText, alpha: 0, delay: 1300, duration: 400, onComplete: () => this.flashText.setVisible(false) });
  }
}
