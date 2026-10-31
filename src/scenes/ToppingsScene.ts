import Phaser from 'phaser';
import { toppingStockId } from '../systems/supplies';
import { TextureKeys } from '../assets/keys';
import type { ToppingWork } from '../stations/toppings';
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
  drawTray,
  fadeTray,
  MESS_SIZE,
  pruneDonutIcons,
  TRAY_PAD,
} from '../ui/donutArt';
import type { Viewport } from '../ui/layout';
import { COLORS, CSS, FONT_FAMILY } from '../ui/theme';
import { listen } from './listen';
import { SceneKeys } from './sceneKeys';
import { StationScene } from './StationScene';
import { TrayWiper } from '../ui/TrayWiper';

const CANVAS_KEY = 'toppings-board';
/** Pieces that missed the donut, left on the tray. */
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
    board: { x: 540, y: 672, size: 440 },
    instruction: { x: 540, y: 988 },
    readout: { x: 540, y: 1032 },
    jars: { x: 470, y: 1220, step: 230, scale: 0.75 },
    trash: { x: 960, y: 1240, size: 130 },
    buttons: { y: 1460, redoX: 270, doneX: 800, scale: 1 },
  },
  landscape: {
    shelf: { x: 1000, y: 160, w: 880, h: 120, size: 92 },
    board: { x: 480, y: 362, size: 460 },
    instruction: { x: 480, y: 684 },
    readout: { x: 480, y: 730 },
    jars: { x: 1340, y: 430, step: 200, scale: 0.7 },
    trash: { x: 1800, y: 440, size: 110 },
    buttons: { y: 705, redoX: 1250, doneX: 1620, scale: 0.85 },
  },
} as const;

export class ToppingsScene extends StationScene {
  private board!: Phaser.GameObjects.Image;
  private canvas!: Phaser.Textures.CanvasTexture;
  private boardZone!: Phaser.GameObjects.Zone;
  private boardTray!: Phaser.GameObjects.Graphics;
  private mess!: Phaser.Textures.CanvasTexture;
  private messImg!: Phaser.GameObjects.Image;
  private messDirty = false;
  /** Where to shake: a dashed loop round the ring (sprinkles), or a spot for a whole cookie. */
  private guideRing!: Phaser.GameObjects.Graphics;
  private guideSpot!: Phaser.GameObjects.Graphics;
  /** The shaking finger, read every frame (its events can go to the rail or tab bar if it strays there). */
  private shakePointer: Phaser.Input.Pointer | null = null;
  /** Scrubbing the empty tray (with no donut on it). */
  private wiper!: TrayWiper;
  private nextShakeSound = 0;
  private shelfBg!: Phaser.GameObjects.Graphics;
  private shelfLabel!: Phaser.GameObjects.Text;
  private shelfImgs: Phaser.GameObjects.Image[] = [];
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

  private boardPos = { x: 0, y: 0, size: 1 };
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
  private dirty = false;
  private shownWork: ToppingWork | null = null;

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
    this.shownWork = null;
    this.input.dragDistanceThreshold = 16;

    this.shelfBg = this.add.graphics();
    this.shelfLabel = this.add
      .text(0, 0, 'shelf', { fontFamily: FONT_FAMILY, fontSize: '28px', fontStyle: 'bold', color: CSS.muted })
      .setOrigin(0.5)
      .setAngle(-90);
    for (let i = 0; i < SLOTS; i++) this.shelfImgs.push(this.makeShelfDonut(i));
    this.trash = this.add.image(0, 0, TextureKeys.TrashBin).setName('toppings-trash');

    if (this.textures.exists(CANVAS_KEY)) this.textures.remove(CANVAS_KEY);
    this.canvas = this.textures.createCanvas(CANVAS_KEY, ART_SIZE, ART_SIZE)!;
    this.boardTray = this.add.graphics();
    if (this.textures.exists(MESS_KEY)) this.textures.remove(MESS_KEY);
    this.mess = this.textures.createCanvas(MESS_KEY, MESS_SIZE, MESS_SIZE)!;
    this.messImg = this.add.image(0, 0, MESS_KEY);
    this.board = this.add.image(0, 0, CANVAS_KEY).setName('toppings-donut');
    this.guideRing = this.add.graphics().setName('toppings-guide-ring');
    this.guideSpot = this.add.graphics().setName('toppings-guide-spot');
    this.boardZone = this.add.zone(0, 0, 1, 1).setInteractive({ useHandCursor: true }).setName('toppings-board');

    // A jar for every topping on the menu; ones not unlocked yet are dotted outlines.
    this.jarHighlight = this.add.graphics();
    this.lockedJars = this.add.graphics();
    const day = session().day;
    for (const t of menu.toppings) {
      const uses = menu.flavors.filter((f) => f.toppings.includes(t.id));
      if (!uses.length) continue;
      const unlock = Math.min(...uses.map((f) => f.unlockDay));
      this.jars.push(this.makeJar(t, unlock > day ? unlock : null));
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
    this.wiper = new TrayWiper(this, 'toppings', () => [this.mess], () => [this.boardPos], () => {
      audio().play('ding');
      this.flash('sparkling clean!');
      this.refresh();
    });
    this.events.on(Phaser.Scenes.Events.SLEEP, this.stopShake, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.SLEEP, this.stopShake, this);
      if (this.textures.exists(CANVAS_KEY)) this.textures.remove(CANVAS_KEY);
      if (this.textures.exists(MESS_KEY)) this.textures.remove(MESS_KEY);
    });
    listen(this, session().events, 'changed', () => this.refresh());
  }

  // ---- Building blocks -----------------------------------------------------------

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
        if (session().trashShelfDonut(i)) this.toTrash(p.worldX, p.worldY, ghost, true);
        else ghost.destroy();
      } else if (Phaser.Math.Distance.Between(p.worldX, p.worldY, this.boardPos.x, this.boardPos.y) < this.boardPos.size * 0.6) {
        this.takeFromShelf(i);
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
      .text(0, 0, lockedUntil === null ? t.name : `${t.name}
day ${lockedUntil}`, {
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
    this.boardPos = { x: c.x + L.board.x, y: c.y + L.board.y, size: L.board.size };
    const { x, y, size } = this.boardPos;
    this.board.setPosition(x, y).setDisplaySize(size, size);
    drawTray(this.boardTray, x, y, size);
    this.messImg.setPosition(x, y).setDisplaySize(size * (1 + 2 * TRAY_PAD), size * (1 + 2 * TRAY_PAD));
    this.drawGuides();
    // Shaking is accepted a bit outside the donut too (those pieces fall off).
    this.boardZone.setPosition(x, y).setSize(size * 1.3, size * 1.3);

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
    const n = this.jars.length;
    this.lockedJars.clear();
    this.jars.forEach((jar, i) => {
      const jx = c.x + L.jars.x + (i - (n - 1) / 2) * L.jars.step;
      const jy = c.y + L.jars.y;
      jar.img.setPosition(jx, jy).setScale(L.jars.scale);
      jar.fill.setPosition(jx, jy).setScale(L.jars.scale);
      jar.label.setPosition(jx, jy + 130 * L.jars.scale + 10);
      if (jar.lockedUntil !== null) {
        // A dotted outline where the jar will be.
        const w = 140 * L.jars.scale;
        const h = 190 * L.jars.scale;
        const pts = [
          { x: -w / 2, y: -h / 2 },
          { x: w / 2, y: -h / 2 },
          { x: w / 2, y: h / 2 },
          { x: -w / 2, y: h / 2 },
          { x: -w / 2, y: -h / 2 },
        ];
        this.lockedJars.lineStyle(4, COLORS.cream, 0.5);
        drawDashedPath(this.lockedJars, jx, jy, 1, pts, 10, 8);
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
    this.shelfImgs.forEach((img, i) => {
      const d = s.shelf[i];
      img.setVisible(!!d);
      if (d) {
        img.setTexture(donutIcon(this, d));
        img.setPosition(this.shelfPos.x + i * this.shelfPos.step, this.shelfPos.y).setDisplaySize(this.shelfPos.size, this.shelfPos.size);
      }
    });

    this.board.setVisible(!!work);
    if (work !== this.shownWork) {
      this.shownWork = work;
      this.redrawCanvas();
    }

    this.setSubtitle(`shelf ${s.shelf.length}/${balance.glaze.shelfCapacity}${work ? ' · 1 on the board' : ''}`);
    const t = this.selectedTopping();
    if (!work) {
      const st = session();
      if (st.phase === 'closing' && st.messOn('toppings') > 0) this.instruction.setText('closing time: scrub the tray clean');
      else this.instruction.setText((s.shelf.length ? 'tap a glazed donut to top it' : 'no glazed donuts: glaze some first!') + (st.messOn('toppings') > balance.cleanup.messDoneAt ? '\n(or scrub the tray clean)' : ''));
    }
    else if (!this.jars.some((j) => j.lockedUntil === null)) this.instruction.setText("nothing on today's menu needs toppings");
    else if (!t) this.instruction.setText('pick a jar');
    else this.instruction.setText(t.style === 'piece' ? `tap the donut to place a ${t.name}` : `shake ${t.name} over the donut`);
    this.refreshControls();
  }

  private refreshControls(): void {
    const work = session().toppingWork;
    this.redoButton.setEnabled(!!work);
    this.doneButton.setEnabled(!!work);

    this.jarHighlight.clear();
    const jar = this.jars.find((j) => j.topping.id === this.selected);
    if (jar) {
      const w = 190 * this.jarScale;
      this.jarHighlight.lineStyle(7, COLORS.pink);
      this.jarHighlight.strokeRoundedRect(jar.img.x - w / 2, jar.img.y - 125 * this.jarScale, w, 250 * this.jarScale, 20);
    }

    const t = this.selectedTopping();
    const n = work && t ? work.countOn(t.id) : 0;
    this.guideRing.setVisible(!!work && t?.style === 'sprinkle' && n < t.amount.min);
    this.guideSpot.setVisible(!!work && t?.style === 'piece' && n < t.amount.min);
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
  private drawGuides(): void {
    const { x, y, size } = this.boardPos;
    const half = size / 2;
    const r = balance.glaze.ringRadius;
    this.guideRing.clear();
    this.guideRing.lineStyle(10, COLORS.ink, 0.25);
    drawDashedPath(this.guideRing, x, y, half, circlePoints(r));
    this.guideRing.lineStyle(5, COLORS.cream, 0.9);
    drawDashedPath(this.guideRing, x, y, half, circlePoints(r));
    // A whole cookie goes across the top of the ring (like the shop's cookie butter photo):
    // an outline the size of the cookie, centred where it should land.
    this.guideSpot.clear();
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
      this.guideSpot.lineStyle(10, COLORS.ink, 0.25);
      drawDashedPath(this.guideSpot, x, y, half, box, 14, 10);
      this.guideSpot.lineStyle(5, COLORS.cream, 0.9);
      drawDashedPath(this.guideSpot, x, y, half, box, 14, 10);
    }
  }

  private selectedTopping(): Topping | undefined {
    return this.jars.find((j) => j.topping.id === this.selected)?.topping;
  }

  private redrawCanvas(): void {
    const ctx = this.canvas.context;
    ctx.clearRect(0, 0, ART_SIZE, ART_SIZE);
    const work = session().toppingWork;
    if (work) drawFinishedDonut(ctx, ART_SIZE, { ...work.donut, toppings: work.pieces });
    this.canvas.refresh();
  }

  // ---- Shaking ----------------------------------------------------------------

  /** The jar that's picked (the tutorial checks it). */
  get selectedJar(): string | null {
    return this.selected;
  }

  /** Tap a jar to pick it up; tap it again to put it down (then a finger on the bare tray wipes it). */
  private select(toppingId: string): void {
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
    if (!s.toppingWork) {
      // No donut on the board: scrub the tray if it's messy (only with no jar in hand).
      if (this.wiper.dirty && !this.selectedTopping()) {
        this.wiper.start(p);
        this.flash('scrubbing the tray clean');
      }
      else this.flash(s.shelf.length ? 'take a donut from the shelf first' : 'glaze some donuts first');
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
    const d = Math.sqrt(Math.random()) * scatter * (this.boardPos.size / 2);
    f.active = true;
    f.startAt = now;
    f.x = x + Math.cos(a) * d;
    f.y = y + Math.sin(a) * d;
    f.fromX = x + (f.x - x) * 0.2;
    f.fromY = y - JAR_LIFT + 40;
    f.toppingId = t.id;
    f.rand = Math.random();
    const px = (t.size * this.boardPos.size) / 2 / ((PIECE_TEX_R * PIECE_TEX) / 2);
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

    if (this.dirty) {
      this.dirty = false;
      this.canvas.refresh();
      this.refreshControls();
    }
    if (this.messDirty) {
      this.messDirty = false;
      this.mess.refresh();
    }
  }

  /** A piece reaches the donut: it sticks (drawn on the donut), or misses and stays on the tray. */
  private land(f: Falling): void {
    const work = session().toppingWork;
    f.img.setPosition(f.x, f.y);
    if (!work) {
      f.active = false;
      f.img.setVisible(false);
      return;
    }
    const { x, y, size } = this.boardPos;
    // The first of a topping on this donut uses a serving; none left, it doesn't land.
    const first = !work.pieces.some((p) => p.toppingId === f.toppingId);
    if (first && session().stockOf(toppingStockId(f.toppingId)) < 1) {
      f.active = false;
      f.img.setVisible(false);
      return;
    }
    if (first) session().useSupply(toppingStockId(f.toppingId));
    const piece = work.add(f.toppingId, (f.x - x) / (size / 2), (f.y - y) / (size / 2), f.rand);
    this.dirty = true;
    f.active = false;
    f.img.setVisible(false);
    if (piece) {
      const t = menu.toppings.find((tp) => tp.id === f.toppingId)!;
      if (piece.on) drawToppingPiece(this.canvas.context, ART_SIZE, piece, t);
      else {
        drawOnTray(this.mess.context, (m, size) => drawToppingPiece(m, size, piece, t));
        session().addMess('toppings', 1);
        this.messDirty = true;
      }
    }
    if (work.pieces.length === 1) this.refresh();
  }

  // ---- Actions ----------------------------------------------------------------

  private takeFromShelf(i: number): void {
    const s = session();
    if (s.toppingWork) {
      this.flash('finish (or redo) the donut on the board first');
      return;
    }
    const img = this.shelfImgs[i]!;
    const from = { x: img.x, y: img.y, size: img.displayWidth, key: img.texture.key };
    if (!s.startToppings(i)) return;
    // A new donut on the tray: the old mess fades a bit.
    fadeTray(this.mess.context, TRAY_KEEP);
    s.fadeMess('toppings', TRAY_KEEP);
    this.mess.refresh();
    const open = this.jars.filter((j) => j.lockedUntil === null);
    if (!this.selected && open.length === 1) {
      this.selected = open[0]!.topping.id;
      this.autoPicked = true;
    }
    const ghost = this.add.image(from.x, from.y, from.key).setDisplaySize(from.size, from.size).setDepth(15);
    this.board.setAlpha(0);
    this.tweens.add({
      targets: ghost,
      x: this.boardPos.x,
      y: this.boardPos.y,
      displayWidth: this.boardPos.size,
      displayHeight: this.boardPos.size,
      duration: 280,
      ease: 'Cubic.Out',
      onComplete: () => {
        ghost.destroy();
        this.board.setAlpha(1);
      },
    });
    this.refresh();
  }

  private redo(): void {
    const s = session();
    if (!s.toppingWork) return;
    this.stopShake();
    // Snapshot the board into its own texture: the board is cleared and the donut's icon dropped once it's trashed.
    if (this.textures.exists(SNAP_KEY)) this.textures.remove(SNAP_KEY);
    const tex = this.textures.createCanvas(SNAP_KEY, ART_SIZE, ART_SIZE)!;
    tex.context.drawImage(this.canvas.getSourceImage() as HTMLCanvasElement, 0, 0);
    tex.refresh();
    const snap = this.add.image(this.boardPos.x, this.boardPos.y, SNAP_KEY).setDisplaySize(this.boardPos.size, this.boardPos.size).setDepth(15);
    s.trashToppings();
    this.toTrash(snap.x, snap.y, snap, true);
    this.flash('trashed: take another from the shelf');
  }

  private done(): void {
    const s = session();
    this.stopShake();
    const before = s.shelf.length;
    const d = s.finishToppings();
    if (!d) return;
    const ghost = this.add.image(this.boardPos.x, this.boardPos.y, donutIcon(this, d)).setDisplaySize(this.boardPos.size, this.boardPos.size).setDepth(15);
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
