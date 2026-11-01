import Phaser from 'phaser';
import { toppingStockId } from '../systems/supplies';
import { TextureKeys } from '../assets/keys';
import type { FinishedDonut, ToppingWork } from '../stations/toppings';
import type { Topping } from '../systems/menu';
import { audio, balance, menu, session } from '../systems/services';
import { Button } from '../ui/Button';
import {
  ART_SIZE,
  circlePoints,
  donutIcon,
  drawDashedPath,
  drawFinishedDonut,
  drawOnTray,
  drawToppingPiece,
  drawTrayRect,
  fadeTray,
  MESS_SIZE,
  pruneDonutIcons,
  TRAY_PAD,
  paintStaleMess,
  jarOutline,
} from '../ui/donutArt';
import type { Viewport } from '../ui/layout';
import { COLORS, CSS, FONT_FAMILY } from '../ui/theme';
import { listen } from './listen';
import { SceneKeys } from './sceneKeys';
import { StationScene } from './StationScene';
import { TrayWiper } from '../ui/TrayWiper';

/** Each spot's donut art, and the pieces that missed it (left on the tray). */
const CANVAS_KEY = 'toppings-canvas';
const MESS_KEY = 'toppings-mess';
/** How much of the tray's mess stays each time a new donut goes on it (the rest fades). */
const TRAY_KEEP = 0.55;
/** Where a whole cookie should sit (normalised y of its centre): across the top of the ring. */
const COOKIE_SPOT_Y = -0.42;
/** Copy of the board flying into the trash on Redo. */
const SNAP_KEY = 'toppings-trash-snap';
const SLOTS = 6;
/** How far above your finger the jar is held (game px). */
const JAR_LIFT = 190;
/** Falling-piece pool size. */
const FALLING = 48;
/** Size of the falling-piece textures, and the piece radius drawn in them (share of half). */
const PIECE_TEX = 64;
const PIECE_TEX_R = 0.7;

interface JarView {
  topping: Topping;
  /** Day it unlocks (if it's still locked today: drawn as a dotted outline). */
  lockedUntil: number | null;
  img: Phaser.GameObjects.Image;
  fill: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
}

/** One spot on the toppings tray: its donut art, its mess, and its guides. */
interface TopBoard {
  x: number;
  y: number;
  size: number;
  img: Phaser.GameObjects.Image;
  canvas: Phaser.Textures.CanvasTexture;
  canvasKey: string;
  mess: Phaser.Textures.CanvasTexture;
  messKey: string;
  messImg: Phaser.GameObjects.Image;
  guideRing: Phaser.GameObjects.Graphics;
  guideSpot: Phaser.GameObjects.Graphics;
  shown: ToppingWork | null;
  dirty: boolean;
  messDirty: boolean;
}

/** A piece on its way down: from the jar's mouth to where it lands (game coords). */
interface Falling {
  active: boolean;
  startAt: number;
  fromX: number;
  fromY: number;
  x: number;
  y: number;
  toppingId: string;
  rand: number;
  img: Phaser.GameObjects.Image;
}

const LAYOUT = {
  portrait: {
    shelf: { x: 40, y: 230, w: 1000, h: 140, size: 110 },
    // Two spots side by side (centre of the pair, each donut's size, gap between centres).
    // The same tray as the Glaze station's (size and spacing), so the two match.
    board: { x: 540, y: 670, size: 360, dx: 400 },
    instruction: { x: 540, y: 988 },
    readout: { x: 540, y: 1032 },
    jars: { x: 470, y: 1160, step: 230, scale: 0.75 },
    trash: { x: 960, y: 1180, size: 130 },
    buttons: { y: 1460, redoX: 270, doneX: 800, scale: 1 },
  },
  landscape: {
    shelf: { x: 1000, y: 160, w: 880, h: 120, size: 92 },
    board: { x: 480, y: 362, size: 370, dx: 430 },
    instruction: { x: 480, y: 684 },
    readout: { x: 480, y: 730 },
    jars: { x: 1340, y: 430, step: 200, scale: 0.7 },
    trash: { x: 1800, y: 440, size: 110 },
    buttons: { y: 705, redoX: 1250, doneX: 1620, scale: 0.85 },
  },
} as const;

export class ToppingsScene extends StationScene {
  /** The spots on the tray (balance.toppings.boards). */
  private boards: TopBoard[] = [];
  private boardZone!: Phaser.GameObjects.Zone;
  private boardTray!: Phaser.GameObjects.Graphics;
  /** With two donuts on the tray, a ring round the one you're working on. */
  private activeRing!: Phaser.GameObjects.Graphics;
  /** The shaking finger, read every frame (its events can go to the rail or tab bar if it strays there). */
  private shakePointer: Phaser.Input.Pointer | null = null;
  /** Scrubbing the empty tray (with no donut on it). */
  private wiper!: TrayWiper;
  private nextShakeSound = 0;
  private shelfBg!: Phaser.GameObjects.Graphics;
  private shelfLabel!: Phaser.GameObjects.Text;
  private shelfImgs: Phaser.GameObjects.Image[] = [];
  /** What each shelf-row image is: a shelf donut, or a plain one from the rack (for the beignet). */
  private rowSrc: ({ kind: 'shelf' | 'rack'; i: number } | null)[] = [];
  private trash!: Phaser.GameObjects.Image;
  private jars: JarView[] = [];
  /** Dotted outlines where locked jars will go. */
  private lockedJars!: Phaser.GameObjects.Graphics;
  private jarHighlight!: Phaser.GameObjects.Graphics;
  private hand!: Phaser.GameObjects.Container;
  private handJar!: Phaser.GameObjects.Image;
  private handFill!: Phaser.GameObjects.Image;
  private falling: Falling[] = [];
  private instruction!: Phaser.GameObjects.Text;
  private readout!: Phaser.GameObjects.Text;
  private flashText!: Phaser.GameObjects.Text;
  private redoButton!: Button;
  private doneButton!: Button;

  /** Size of a donut on the tray (both spots are the same). */
  private boardSize = 1;
  private shelfPos = { x: 0, y: 0, step: 0, size: 0 };
  private jarScale = 1;
  private selected: string | null = null;
  /** The jar was picked for you (the only one open): tapping it keeps it, not puts it down. */
  private autoPicked = false;
  private shaking = false;
  private fingerX = 0;
  private fingerY = 0;
  private lastEmit = 0;
  private nextFalling = 0;

  constructor() {
    super(SceneKeys.Toppings, 'Toppings Station', 0x4a5a6b, null);
  }

  protected override headerPosition(v: Viewport) {
    if (v.orientation === 'landscape') return { x: v.content.x + 1440, titleY: v.content.y + 45, subtitleY: v.content.y + 100 };
    return super.headerPosition(v);
  }

  protected buildStation(): void {
    this.shelfImgs = [];
    this.jars = [];
    this.falling = [];
    this.selected = null;
    this.shaking = false;
    this.boards = [];
    this.input.dragDistanceThreshold = 16;

    this.shelfBg = this.add.graphics();
    this.shelfLabel = this.add
      .text(0, 0, 'shelf', { fontFamily: FONT_FAMILY, fontSize: '28px', fontStyle: 'bold', color: CSS.muted })
      .setOrigin(0.5)
      .setAngle(-90);
    for (let i = 0; i < SLOTS; i++) this.shelfImgs.push(this.makeShelfDonut(i));
    this.trash = this.add.image(0, 0, TextureKeys.TrashBin).setName('toppings-trash');

    this.boardTray = this.add.graphics();
    const spots = session().toppingBoards.length;
    for (let i = 0; i < spots; i++) this.boards.push(this.makeBoard(i));
    // Mess left from before (not cleaned up yesterday, or before a reload) is still there, maybe moldy.
    const stale = session().messOn('toppings');
    if (stale > 0) {
      this.boards.forEach((b, i) => {
        paintStaleMess(b.mess.context, stale / this.boards.length, session().moldOn('toppings'), i + 1, ['#2b2420', '#f1ece2', '#ff8a3d', '#c8955f']);
        b.mess.refresh();
      });
    }
    this.activeRing = this.add.graphics();
    this.boardZone = this.add.zone(0, 0, 1, 1).setInteractive({ useHandCursor: true }).setName('toppings-board');

    // A jar for every topping on the menu; ones not unlocked yet are dotted outlines.
    this.jarHighlight = this.add.graphics();
    this.lockedJars = this.add.graphics();
    const day = session().day;
    for (const t of menu.toppings) {
      const uses = menu.flavors.filter((f) => f.toppings.includes(t.id));
      if (!uses.length) continue;
      const unlock = Math.min(...uses.map((f) => f.unlockDay));
      // The tutorial teaches with any flavour, so everything is out for it.
      this.jars.push(this.makeJar(t, unlock > day && !session().isTutorial ? unlock : null));
    }

    for (let i = 0; i < FALLING; i++) {
      this.falling.push({
        active: false,
        startAt: 0,
        fromX: 0,
        fromY: 0,
        x: 0,
        y: 0,
        toppingId: '',
        rand: 0,
        img: this.add.image(0, 0, TextureKeys.ToppingJar).setVisible(false).setDepth(19),
      });
    }
    this.handJar = this.add.image(0, 0, TextureKeys.ToppingJar);
    this.handFill = this.add.image(0, 0, TextureKeys.ToppingJar);
    this.hand = this.add.container(0, 0, [this.handJar, this.handFill]).setVisible(false).setDepth(20);

    const text = (size: number, color: string, bold = false) =>
      this.add.text(0, 0, '', { fontFamily: FONT_FAMILY, fontSize: `${size}px`, fontStyle: bold ? 'bold' : 'normal', color, align: 'center' }).setOrigin(0.5);
    this.instruction = text(42, CSS.cream, true).setName('toppings-instruction');
    this.readout = text(34, CSS.muted).setName('toppings-readout');
    this.flashText = text(48, CSS.ink, true).setBackgroundColor(CSS.cream).setPadding(24, 14, 24, 14).setDepth(30).setVisible(false).setName('toppings-flash');

    this.redoButton = new Button(this, 0, 0, 'Redo', () => this.redo(), { width: 320, fill: COLORS.danger, name: 'btn-toppings-redo' });
    this.doneButton = new Button(this, 0, 0, 'Done', () => this.done(), { width: 360, name: 'btn-toppings-done' });

    this.boardZone.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => this.startShake(p));
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      this.fingerX = p.worldX;
      this.fingerY = p.worldY;
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, () => this.stopShake());
    this.wiper = new TrayWiper(
      this,
      'toppings',
      () => this.boards.map((b) => b.mess),
      () => this.boards,
      () => {
        audio().play('ding');
        this.flash('sparkling clean!');
        this.refresh();
      },
      // Picking up the sponge puts the jar down.
      () => {
        this.selected = null;
        this.autoPicked = false;
        this.refresh();
      },
    );
    this.events.on(Phaser.Scenes.Events.SLEEP, this.stopShake, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.SLEEP, this.stopShake, this);
      for (const b of this.boards) {
        if (this.textures.exists(b.canvasKey)) this.textures.remove(b.canvasKey);
        if (this.textures.exists(b.messKey)) this.textures.remove(b.messKey);
      }
    });
    listen(this, session().events, 'changed', () => this.refresh());
  }

  // ---- Building blocks -----------------------------------------------------------

  /** One spot: the tray's mess under it, the donut art, and its guides (spot 0 keeps the tutorial's names). */
  private makeBoard(i: number): TopBoard {
    const canvasKey = `${CANVAS_KEY}-${i}`;
    const messKey = `${MESS_KEY}-${i}`;
    for (const k of [canvasKey, messKey]) if (this.textures.exists(k)) this.textures.remove(k);
    const mess = this.textures.createCanvas(messKey, MESS_SIZE, MESS_SIZE)!;
    const messImg = this.add.image(0, 0, messKey);
    const canvas = this.textures.createCanvas(canvasKey, ART_SIZE, ART_SIZE)!;
    const sfx = i === 0 ? '' : `-${i}`;
    return {
      x: 0,
      y: 0,
      size: 1,
      canvas,
      canvasKey,
      mess,
      messKey,
      messImg,
      img: this.add.image(0, 0, canvasKey).setName(`toppings-donut${sfx}`).setVisible(false),
      guideRing: this.add.graphics().setName(`toppings-guide-ring${sfx}`).setVisible(false),
      guideSpot: this.add.graphics().setName(`toppings-guide-spot${sfx}`).setVisible(false),
      shown: null,
      dirty: false,
      messDirty: false,
    };
  }

  /** The spot nearest (x, y). */
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

  private work(i: number): ToppingWork | null {
    return session().toppingBoards[i] ?? null;
  }

  private makeShelfDonut(i: number): Phaser.GameObjects.Image {
    const img = this.add.image(0, 0, TextureKeys.DonutFry).setVisible(false).setName(`toppings-shelf-${i}`).setDepth(5);
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
        const src = this.rowSrc[i];
        const gone = src?.kind === 'rack' ? session().trashRackDonut(src.i) : src ? session().trashShelfDonut(src.i) : false;
        if (gone) this.toTrash(p.worldX, p.worldY, ghost, true);
        else ghost.destroy();
      } else {
        // Dropped on a spot: that one (if it's free).
        const spot = this.nearestSpot(p.worldX, p.worldY);
        const b = this.boards[spot]!;
        if (Phaser.Math.Distance.Between(p.worldX, p.worldY, b.x, b.y) < b.size * 0.6) this.takeFromShelf(i, spot);
      }
      this.refresh();
    });
    img.on(Phaser.Input.Events.POINTER_UP, () => {
      if (!dragged) this.takeFromShelf(i);
    });
    return img;
  }

  /** A small texture of one piece of a topping (falling pieces and jar contents). */
  private pieceTexture(t: Topping): string {
    const key = `topping-piece-${t.id}`;
    if (this.textures.exists(key)) return key;
    const tex = this.textures.createCanvas(key, PIECE_TEX, PIECE_TEX)!;
    drawToppingPiece(tex.context, PIECE_TEX, { toppingId: t.id, x: 0, y: 0, rot: 0, on: true, ball: 0 }, { ...t, size: PIECE_TEX_R });
    tex.refresh();
    return key;
  }

  /** What's inside a jar: a pile of its topping (drawn once per topping). */
  private jarFillTexture(t: Topping): string {
    const key = `topping-jar-fill-${t.id}`;
    if (this.textures.exists(key)) return key;
    // Same size as the jar art; the glass is roughly x 15–145, y 35–215 (see MANIFEST).
    const tex = this.textures.createCanvas(key, 160, 220)!;
    const ctx = tex.context;
    let s = 7;
    const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    const big = t.style === 'piece';
    const count = big ? 4 : 40;
    const r = big ? 0.42 : t.shape === 'loop' ? 0.12 : 0.1;
    for (let i = 0; i < count; i++) {
      const x = big ? 80 : 32 + rnd() * 96;
      const y = big ? 200 - i * 34 : 105 + rnd() * 100;
      ctx.save();
      // drawToppingPiece draws in a size×size square centred on (x, y) normalised; use a 160 square.
      ctx.translate(x - 80, y - 80);
      drawToppingPiece(ctx, 160, { toppingId: t.id, x: 0, y: 0, rot: big ? (rnd() - 0.5) * 0.4 : rnd() * Math.PI * 2, on: true, ball: 0 }, { ...t, size: r });
      ctx.restore();
    }
    tex.refresh();
    return key;
  }

  private makeJar(t: Topping, lockedUntil: number | null): JarView {
    const img = this.add.image(0, 0, TextureKeys.ToppingJar).setName(`jar-${t.id}`);
    const fill = this.add.image(0, 0, this.jarFillTexture(t));
    if (lockedUntil === null) {
      img.setInteractive({ useHandCursor: true });
      img.on(Phaser.Input.Events.POINTER_DOWN, () => this.select(t.id));
    } else {
      img.setVisible(false);
      fill.setVisible(false);
    }
    const label = this.add
      .text(0, 0, lockedUntil === null ? t.name : '', {
        fontFamily: FONT_FAMILY,
        fontSize: '26px',
        color: lockedUntil === null ? CSS.cream : CSS.muted,
        align: 'center',
        wordWrap: { width: 190 },
      })
      .setOrigin(0.5, 0);
    return { topping: t, img, fill, label, lockedUntil };
  }

  protected layoutStation(v: Viewport): void {
    const L = LAYOUT[v.orientation];
    const c = v.content;
    const B = L.board;
    const n = this.boards.length;
    const size = B.size;
    this.boardSize = size;
    const x = c.x + B.x;
    const y = c.y + B.y;
    this.boards.forEach((b, i) => {
      b.x = x + (i - (n - 1) / 2) * B.dx;
      b.y = y;
      b.size = size;
      b.img.setPosition(b.x, b.y).setDisplaySize(size, size);
      b.messImg.setPosition(b.x, b.y).setDisplaySize(size * (1 + 2 * TRAY_PAD), size * (1 + 2 * TRAY_PAD));
      this.drawGuides(b);
    });
    // One steel tray under both spots.
    const trayW = (n - 1) * B.dx + size * (1 + 2 * TRAY_PAD);
    const trayH = size * (1 + 2 * TRAY_PAD);
    this.boardTray.clear();
    drawTrayRect(this.boardTray, x, y, trayW, trayH);
    // Shaking is accepted a bit outside the donuts too (those pieces fall off).
    this.boardZone.setPosition(x, y).setSize(trayW, trayH);
    this.wiper.placeIcon(x + trayW / 2 - 70, y - trayH / 2 + 50, 0.8);

    const sh = L.shelf;
    this.shelfBg.clear();
    this.shelfBg.fillStyle(0x2b2522);
    this.shelfBg.fillRoundedRect(c.x + sh.x, c.y + sh.y, sh.w, sh.h, 18);
    this.shelfBg.lineStyle(5, COLORS.ink);
    this.shelfBg.strokeRoundedRect(c.x + sh.x, c.y + sh.y, sh.w, sh.h, 18);
    this.shelfPos = { x: c.x + sh.x + 70 + sh.size / 2, y: c.y + sh.y + sh.h / 2, step: Math.min(sh.size * 1.35, (sh.w - 160) / (SLOTS - 1)), size: sh.size };
    this.shelfLabel.setPosition(c.x + sh.x + 30, c.y + sh.y + sh.h / 2);
    this.trash.setPosition(c.x + L.trash.x, c.y + L.trash.y).setDisplaySize(L.trash.size, L.trash.size);

    this.jarScale = L.jars.scale;
    const jarCount = this.jars.length;
    this.lockedJars.clear();
    this.jars.forEach((jar, i) => {
      const jx = c.x + L.jars.x + (i - (jarCount - 1) / 2) * L.jars.step;
      const jy = c.y + L.jars.y;
      jar.img.setPosition(jx, jy).setScale(L.jars.scale);
      jar.fill.setPosition(jx, jy).setScale(L.jars.scale);
      jar.label.setPosition(jx, jy + 130 * L.jars.scale + 10);
      if (jar.lockedUntil !== null) {
        // A dotted jar where the next topping will go (no name: it's a surprise).
        this.lockedJars.lineStyle(4, COLORS.cream, 0.45);
        for (const path of jarOutline(130 * L.jars.scale, 180 * L.jars.scale)) drawDashedPath(this.lockedJars, jx, jy, 1, path, 10, 8);
      }
    });

    this.instruction.setPosition(c.x + L.instruction.x, c.y + L.instruction.y);
    this.readout.setPosition(c.x + L.readout.x, c.y + L.readout.y);
    this.flashText.setPosition(x, y);
    this.redoButton.setPosition(c.x + L.buttons.redoX, c.y + L.buttons.y).setScale(L.buttons.scale);
    this.doneButton.setPosition(c.x + L.buttons.doneX, c.y + L.buttons.y).setScale(L.buttons.scale);
    this.refresh();
  }

  // ---- State → screen -----------------------------------------------------------

  private refresh(): void {
    this.wiper?.refreshIcon();
    // Servings left under each jar (when supplies are counted).
    for (const jar of this.jars) {
      if (jar.lockedUntil !== null) continue;
      const n = session().stockOf(toppingStockId(jar.topping.id));
      jar.label.setText(Number.isFinite(n) ? `${jar.topping.name}\n${n} left` : jar.topping.name).setColor(n < 1 ? '#ff9b9b' : CSS.cream);
      jar.img.setAlpha(n < 1 ? 0.4 : 1);
    }
    const s = session();
    const work = s.toppingWork;

    pruneDonutIcons(this);
    const row: { kind: 'shelf' | 'rack'; i: number; d: FinishedDonut }[] = s.shelf.map((d, i) => ({ kind: 'shelf' as const, i, d }));
    if (s.unglazedOnMenu) s.rack.forEach((fd, i) => row.push({ kind: 'rack', i, d: { id: fd.id, fry: fd, layers: [] } }));
    this.rowSrc = this.shelfImgs.map((_, i) => (row[i] ? { kind: row[i]!.kind, i: row[i]!.i } : null));
    this.shelfImgs.forEach((img, i) => {
      const e = row[i];
      img.setVisible(!!e);
      if (e) {
        img.setName(e.kind === 'rack' ? `toppings-rack-${e.i}` : `toppings-shelf-${e.i}`);
        img.setTexture(donutIcon(this, e.d));
        img.setPosition(this.shelfPos.x + i * this.shelfPos.step, this.shelfPos.y).setDisplaySize(this.shelfPos.size, this.shelfPos.size);
      }
    });

    this.boards.forEach((b, i) => {
      const w = this.work(i);
      b.img.setVisible(!!w);
      if (w !== b.shown) {
        b.shown = w;
        this.redrawCanvas(b, w);
      }
    });
    const onTray = s.toppingBoards.filter((w) => w).length;

    this.setSubtitle(`shelf ${s.shelf.length}/${balance.glaze.shelfCapacity}${onTray ? ` · ${onTray} on the tray` : ''}`);
    const t = this.selectedTopping();
    if (!work) {
      const st = session();
      if (st.phase === 'closing' && st.messOn('toppings') > 0) this.instruction.setText('closing time: scrub the tray clean');
      else {
        const plain = s.unglazedOnMenu;
        const any = s.shelf.length || (plain && s.rack.length);
        const none = plain ? 'no donuts yet: fry some first!' : 'no glazed donuts: glaze some first!';
        const scrub = st.moldOn('toppings') > 0 ? '\nthe tray is moldy! scrub it clean first' : st.messOn('toppings') > balance.cleanup.messDoneAt ? '\n(or scrub the tray clean)' : '';
        this.instruction.setText((any ? 'tap a donut to top it' : none) + scrub);
      }
    }
    else if (!this.jars.some((j) => j.lockedUntil === null)) this.instruction.setText("nothing on today's menu needs toppings");
    else if (!t) this.instruction.setText('pick a jar');
    else this.instruction.setText(t.style === 'piece' ? `tap the donut to place a ${t.name}` : `shake ${t.name} over the donut`);
    this.refreshControls();
  }

  private refreshControls(): void {
    const s = session();
    const work = s.toppingWork;
    this.redoButton.setEnabled(!!work);
    this.doneButton.setEnabled(!!work);

    // With two donuts on the tray, ring the one you're working on.
    this.activeRing.clear();
    const active = this.boards[s.activeToppingSpot];
    if (active && work && s.toppingBoards.filter((w) => w).length > 1) {
      this.activeRing.lineStyle(6, COLORS.pink, 0.8);
      this.activeRing.strokeCircle(active.x, active.y, active.size * 0.53);
    }

    this.jarHighlight.clear();
    const jar = this.jars.find((j) => j.topping.id === this.selected);
    if (jar) {
      const w = 190 * this.jarScale;
      this.jarHighlight.lineStyle(7, COLORS.pink);
      this.jarHighlight.strokeRoundedRect(jar.img.x - w / 2, jar.img.y - 125 * this.jarScale, w, 250 * this.jarScale, 20);
    }

    // The guides show on the donut you're working on.
    const t = this.selectedTopping();
    const n = work && t ? work.countOn(t.id) : 0;
    this.boards.forEach((b, i) => {
      const here = !!work && i === s.activeToppingSpot;
      b.guideRing.setVisible(here && t?.style === 'sprinkle' && n < t.amount.min);
      b.guideSpot.setVisible(here && t?.style === 'piece' && n < t.amount.min);
    });
    if (!work) {
      this.readout.setText('');
      return;
    }
    const parts: string[] = [];
    for (const j of this.jars) {
      let on = 0;
      let off = 0;
      for (const p of work.pieces) {
        if (p.toppingId !== j.topping.id) continue;
        if (p.on) on++;
        else off++;
      }
      if (on || off) parts.push(`${j.topping.name}: ${on}${off ? ` (${off} fell off)` : ''}`);
    }
    this.readout.setText(parts.length ? parts.join(' · ') : 'no toppings yet');
  }

  /** A dashed loop round the middle of the ring, and a target on the top ball for a whole cookie. */
  private drawGuides(b: TopBoard): void {
    const { x, y, size } = b;
    const half = size / 2;
    const r = balance.glaze.ringRadius;
    b.guideRing.clear();
    b.guideRing.lineStyle(10, COLORS.ink, 0.25);
    drawDashedPath(b.guideRing, x, y, half, circlePoints(r));
    b.guideRing.lineStyle(5, COLORS.cream, 0.9);
    drawDashedPath(b.guideRing, x, y, half, circlePoints(r));
    // A whole cookie goes across the top of the ring (like the shop's cookie butter photo):
    // an outline the size of the cookie, centred where it should land.
    b.guideSpot.clear();
    const cookie = menu.toppings.find((tp) => tp.style === 'piece');
    if (cookie) {
      const w = cookie.size * 1.6;
      const h = cookie.size * 1.05;
      const cy = COOKIE_SPOT_Y;
      const box = [
        { x: -w / 2, y: cy - h / 2 },
        { x: w / 2, y: cy - h / 2 },
        { x: w / 2, y: cy + h / 2 },
        { x: -w / 2, y: cy + h / 2 },
        { x: -w / 2, y: cy - h / 2 },
      ];
      b.guideSpot.lineStyle(10, COLORS.ink, 0.25);
      drawDashedPath(b.guideSpot, x, y, half, box, 14, 10);
      b.guideSpot.lineStyle(5, COLORS.cream, 0.9);
      drawDashedPath(b.guideSpot, x, y, half, box, 14, 10);
    }
  }

  private selectedTopping(): Topping | undefined {
    return this.jars.find((j) => j.topping.id === this.selected)?.topping;
  }

  private redrawCanvas(b: TopBoard, work: ToppingWork | null): void {
    const ctx = b.canvas.context;
    ctx.clearRect(0, 0, ART_SIZE, ART_SIZE);
    if (work) drawFinishedDonut(ctx, ART_SIZE, { ...work.donut, toppings: work.pieces });
    b.canvas.refresh();
  }

  // ---- Shaking ----------------------------------------------------------------

  /** The jar that's picked (the tutorial checks it). */
  get selectedJar(): string | null {
    return this.selected;
  }

  /** Tap a jar to pick it up; tap it again to put it down (then a finger on the bare tray wipes it). */
  private select(toppingId: string): void {
    // Picking a jar puts the sponge down.
    if (this.wiper.holding) {
      this.wiper.holding = false;
      this.wiper.refreshIcon();
    }
    if (this.selected !== toppingId && session().stockOf(toppingStockId(toppingId)) < 1) {
      const t = menu.toppings.find((x) => x.id === toppingId);
      this.flash(`out of ${t?.name ?? 'that'}!\nbuy more at the store`);
      return;
    }
    this.selected = this.selected === toppingId && !this.autoPicked ? null : toppingId;
    this.autoPicked = false;
    this.refresh();
  }

  private startShake(p: Phaser.Input.Pointer): void {
    const s = session();
    // Sponge in hand: scrub.
    if (this.wiper.holding) {
      this.wiper.start(p);
      return;
    }
    // Working on the donut nearest your finger (if there's one there).
    const spot = this.nearestSpot(p.worldX, p.worldY);
    if (this.work(spot)) s.setActiveTopping(spot);
    if (!s.toppingWork) {
      // No donut on the tray: scrub it if it's messy (only with no jar in hand).
      if (this.wiper.dirty && !this.selectedTopping()) {
        this.wiper.start(p);
        this.flash('scrubbing the tray clean');
      }
      else this.flash(s.shelf.length || (s.unglazedOnMenu && s.rack.length) ? 'take a donut from the shelf first' : s.unglazedOnMenu ? 'fry some donuts first' : 'glaze some donuts first');
      return;
    }
    const t = this.selectedTopping();
    if (!t) {
      this.flash('pick a jar first!');
      return;
    }
    if (s.toppingWork.full) {
      this.flash("that's plenty!");
      return;
    }
    this.fingerX = p.worldX;
    this.fingerY = p.worldY;
    if (t.style === 'piece') {
      // One whole piece per tap, dropped from just above your finger.
      this.emit(t, this.time.now, p.worldX, p.worldY, 0);
      audio().play('lid');
      return;
    }
    this.shaking = true;
    this.shakePointer = p;
    this.lastEmit = this.time.now - balance.toppings.sprinkleEveryMs;
    this.handJar.setScale(0.6);
    this.handFill.setTexture(this.jarFillTexture(t)).setScale(0.6);
    this.hand.setVisible(true).setAngle(180);
    this.tweens.killTweensOf(this.hand);
    this.tweens.add({ targets: this.hand, angle: { from: 170, to: 190 }, duration: 80, yoyo: true, repeat: -1 });
  }

  private stopShake(): void {
    this.wiper?.stop();
    if (!this.shaking) return;
    this.shaking = false;
    this.shakePointer = null;
    this.tweens.killTweensOf(this.hand);
    this.hand.setVisible(false);
  }

  /** Release one piece of `t` from (fromX, fromY) to land around (x, y). */
  private emit(t: Topping, now: number, x: number, y: number, scatter: number): void {
    const f = this.falling[this.nextFalling]!;
    this.nextFalling = (this.nextFalling + 1) % FALLING;
    if (f.active) this.land(f); // pool wrapped: land the oldest now
    const a = Math.random() * Math.PI * 2;
    const d = Math.sqrt(Math.random()) * scatter * (this.boardSize / 2);
    f.active = true;
    f.startAt = now;
    f.x = x + Math.cos(a) * d;
    f.y = y + Math.sin(a) * d;
    f.fromX = x + (f.x - x) * 0.2;
    f.fromY = y - JAR_LIFT + 40;
    f.toppingId = t.id;
    f.rand = Math.random();
    const px = (t.size * this.boardSize) / 2 / ((PIECE_TEX_R * PIECE_TEX) / 2);
    f.img.setTexture(this.pieceTexture(t)).setScale(px).setRotation(f.rand * Math.PI * 2).setAlpha(1).setPosition(f.fromX, f.fromY).setVisible(true);
  }

  override update(time: number): void {
    const work = session().toppingWork;
    const tb = balance.toppings;

    // Follow the shaking finger directly (its events may go to the rail or tab bar if it strays there).
    this.wiper.update(time);
    const sp = this.shakePointer;
    if (this.shaking && sp) {
      if (!sp.isDown) this.stopShake();
      else {
        this.fingerX = sp.x;
        this.fingerY = sp.y;
      }
    }

    if (this.shaking && work) {
      this.hand.setPosition(this.fingerX, this.fingerY - JAR_LIFT);
      const t = this.selectedTopping();
      if (t) {
        // Steady stream whatever the frame rate: a slow frame releases the pieces it owes (up to a few).
        if (time - this.lastEmit > tb.sprinkleEveryMs * 4) this.lastEmit = time - tb.sprinkleEveryMs * 4;
        while (time - this.lastEmit >= tb.sprinkleEveryMs && !work.full) {
          this.lastEmit += tb.sprinkleEveryMs;
          this.emit(t, time, this.fingerX, this.fingerY, tb.scatter);
          if (time >= this.nextShakeSound) {
            this.nextShakeSound = time + 120;
            audio().play('shake');
          }
        }
      }
    }

    for (const f of this.falling) {
      if (!f.active) continue;
      const k = (time - f.startAt) / tb.fallMs;
      if (k >= 1) {
        this.land(f);
        continue;
      }
      f.img.setPosition(f.fromX + (f.x - f.fromX) * k, f.fromY + (f.y - f.fromY) * k * k);
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
   * A piece reaches the spot under it: it sticks to that donut (drawn on it), or
   * misses and stays on the tray. On an empty spot it all lands on the tray.
   */
  private land(f: Falling): void {
    f.img.setPosition(f.x, f.y);
    const b = this.boards[this.nearestSpot(f.x, f.y)]!;
    const work = this.work(this.boards.indexOf(b));
    const { x, y, size } = b;
    if (!work) {
      f.active = false;
      f.img.setVisible(false);
      const t = menu.toppings.find((tp) => tp.id === f.toppingId);
      if (t) {
        const piece = { toppingId: t.id, x: (f.x - x) / (size / 2), y: (f.y - y) / (size / 2), rot: f.rand * Math.PI * 2, on: false, ball: -1 };
        drawOnTray(b.mess.context, (m, sz) => drawToppingPiece(m, sz, piece, t), false);
        session().addMess('toppings', 1);
        b.messDirty = true;
      }
      return;
    }
    // The first of a topping on this donut uses a serving; none left, it doesn't land.
    const first = !work.pieces.some((p) => p.toppingId === f.toppingId);
    if (first && session().stockOf(toppingStockId(f.toppingId)) < 1) {
      f.active = false;
      f.img.setVisible(false);
      return;
    }
    if (first) session().useSupply(toppingStockId(f.toppingId));
    const piece = work.add(f.toppingId, (f.x - x) / (size / 2), (f.y - y) / (size / 2), f.rand);
    b.dirty = true;
    f.active = false;
    f.img.setVisible(false);
    if (piece) {
      const t = menu.toppings.find((tp) => tp.id === f.toppingId)!;
      if (piece.on) drawToppingPiece(b.canvas.context, ART_SIZE, piece, t);
      else {
        drawOnTray(b.mess.context, (m, sz) => drawToppingPiece(m, sz, piece, t));
        session().addMess('toppings', 1);
        b.messDirty = true;
      }
    }
    if (work.pieces.length === 1) this.refresh();
  }

  // ---- Actions ----------------------------------------------------------------

  /** Take the donut shown at row image `i` (a shelf donut, or a plain one from the rack). */
  private takeFromShelf(i: number, spot?: number): void {
    const s = session();
    if (s.toppingBoards.every((w) => w)) {
      this.flash('the tray is full: finish (or redo) a donut first');
      return;
    }
    const img = this.shelfImgs[i]!;
    const src = this.rowSrc[i];
    if (!src) return;
    const from = { x: img.x, y: img.y, size: img.displayWidth, key: img.texture.key };
    if (!(src.kind === 'rack' ? s.startToppingsFromRack(src.i, spot) : s.startToppings(src.i, spot))) return;
    const b = this.boards[s.activeToppingSpot]!;
    // A new donut on the tray: the old mess under it fades a bit.
    fadeTray(b.mess.context, TRAY_KEEP);
    s.fadeMess('toppings', TRAY_KEEP);
    b.mess.refresh();
    const open = this.jars.filter((j) => j.lockedUntil === null);
    if (!this.selected && open.length === 1) {
      this.selected = open[0]!.topping.id;
      this.autoPicked = true;
    }
    const ghost = this.add.image(from.x, from.y, from.key).setDisplaySize(from.size, from.size).setDepth(15);
    b.img.setAlpha(0);
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
      },
    });
    this.refresh();
  }

  private redo(): void {
    const s = session();
    if (!s.toppingWork) return;
    this.stopShake();
    // Snapshot the donut into its own texture: its spot is cleared and the icon dropped once it's trashed.
    const b = this.boards[s.activeToppingSpot]!;
    if (this.textures.exists(SNAP_KEY)) this.textures.remove(SNAP_KEY);
    const tex = this.textures.createCanvas(SNAP_KEY, ART_SIZE, ART_SIZE)!;
    tex.context.drawImage(b.canvas.getSourceImage() as HTMLCanvasElement, 0, 0);
    tex.refresh();
    const snap = this.add.image(b.x, b.y, SNAP_KEY).setDisplaySize(b.size, b.size).setDepth(15);
    s.trashToppings();
    this.toTrash(snap.x, snap.y, snap, true);
    this.flash('trashed: take another from the shelf');
  }

  /** Done: every donut on the tray goes back on the shelf. */
  private done(): void {
    const s = session();
    this.stopShake();
    this.boards.forEach((b, i) => {
      if (!this.work(i)) return;
      const before = s.shelf.length;
      const d = s.finishToppings(i);
      if (!d) return;
      const ghost = this.add.image(b.x, b.y, donutIcon(this, d)).setDisplaySize(b.size, b.size).setDepth(15);
      this.tweens.add({
        targets: ghost,
        x: this.shelfPos.x + before * this.shelfPos.step,
        y: this.shelfPos.y,
        displayWidth: this.shelfPos.size,
        displayHeight: this.shelfPos.size,
        duration: 380,
        ease: 'Cubic.InOut',
        onComplete: () => ghost.destroy(),
      });
    });
  }

  /** A loose copy of an image (made before trashing, while it still shows the donut). */
  private ghostOf(img: Phaser.GameObjects.Image): Phaser.GameObjects.Image {
    const g = this.add.image(img.x, img.y, img.texture.key).setDisplaySize(img.displayWidth, img.displayHeight).setDepth(15);
    if (img.isTinted) g.setTint(img.tintTopLeft);
    return g;
  }

  private overTrash(x: number, y: number): boolean {
    return Phaser.Math.Distance.Between(x, y, this.trash.x, this.trash.y) < Math.max(this.trash.displayWidth, 150);
  }

  /** Fly a copy of a donut into the trash can. `owned` = animate the passed image itself. */
  private toTrash(x: number, y: number, img: Phaser.GameObjects.Image, owned = false): void {
    audio().play('trash');
    const ghost = owned ? img : this.add.image(x, y, img.texture.key).setDisplaySize(img.displayWidth, img.displayHeight).setDepth(15);
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
