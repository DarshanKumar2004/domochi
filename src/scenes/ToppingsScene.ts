import Phaser from 'phaser';
import { TextureKeys } from '../assets/keys';
import type { ToppingWork } from '../stations/toppings';
import { flavorsForDay, type Topping } from '../systems/menu';
import { balance, menu, session } from '../systems/services';
import { Button } from '../ui/Button';
import { ART_SIZE, donutIcon, drawFinishedDonut, drawToppingPiece, pruneDonutIcons } from '../ui/donutArt';
import type { Viewport } from '../ui/layout';
import { COLORS, CSS, FONT_FAMILY } from '../ui/theme';
import { listen } from './listen';
import { SceneKeys } from './sceneKeys';
import { StationScene } from './StationScene';

const CANVAS_KEY = 'toppings-board';
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
  /** After landing off the donut it keeps falling and fades. */
  fellOff: boolean;
  toppingId: string;
  rand: number;
  img: Phaser.GameObjects.Image;
}

const LAYOUT = {
  portrait: {
    shelf: { x: 40, y: 230, w: 1000, h: 140, size: 110 },
    board: { x: 540, y: 660, size: 520 },
    instruction: { x: 540, y: 960 },
    readout: { x: 540, y: 1012 },
    jars: { x: 470, y: 1220, step: 230, scale: 0.75 },
    trash: { x: 960, y: 1240, size: 130 },
    buttons: { y: 1460, redoX: 270, doneX: 800, scale: 1 },
  },
  landscape: {
    shelf: { x: 1000, y: 160, w: 880, h: 120, size: 92 },
    board: { x: 480, y: 360, size: 500 },
    instruction: { x: 480, y: 670 },
    readout: { x: 480, y: 720 },
    jars: { x: 1340, y: 430, step: 200, scale: 0.7 },
    trash: { x: 1800, y: 440, size: 110 },
    buttons: { y: 705, redoX: 1250, doneX: 1620, scale: 0.85 },
  },
} as const;

export class ToppingsScene extends StationScene {
  private board!: Phaser.GameObjects.Image;
  private canvas!: Phaser.Textures.CanvasTexture;
  private boardZone!: Phaser.GameObjects.Zone;
  private shelfBg!: Phaser.GameObjects.Graphics;
  private shelfLabel!: Phaser.GameObjects.Text;
  private shelfImgs: Phaser.GameObjects.Image[] = [];
  private trash!: Phaser.GameObjects.Image;
  private jars: JarView[] = [];
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
    this.board = this.add.image(0, 0, CANVAS_KEY).setName('toppings-donut');
    this.boardZone = this.add.zone(0, 0, 1, 1).setInteractive({ useHandCursor: true }).setName('toppings-board');

    // Jars for every topping used by today's flavours.
    const used = new Set(flavorsForDay(menu, session().day).flatMap((f) => f.toppings));
    this.jarHighlight = this.add.graphics();
    for (const t of menu.toppings.filter((x) => used.has(x.id))) this.jars.push(this.makeJar(t));

    for (let i = 0; i < FALLING; i++) {
      this.falling.push({
        active: false,
        startAt: 0,
        fromX: 0,
        fromY: 0,
        x: 0,
        y: 0,
        fellOff: false,
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
    this.events.on(Phaser.Scenes.Events.SLEEP, this.stopShake, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.SLEEP, this.stopShake, this);
      if (this.textures.exists(CANVAS_KEY)) this.textures.remove(CANVAS_KEY);
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

  private makeJar(t: Topping): JarView {
    const img = this.add.image(0, 0, TextureKeys.ToppingJar).setName(`jar-${t.id}`);
    const fill = this.add.image(0, 0, this.jarFillTexture(t));
    img.setInteractive({ useHandCursor: true });
    img.on(Phaser.Input.Events.POINTER_DOWN, () => this.select(t.id));
    const label = this.add
      .text(0, 0, t.name, { fontFamily: FONT_FAMILY, fontSize: '26px', color: CSS.cream, align: 'center', wordWrap: { width: 190 } })
      .setOrigin(0.5, 0);
    return { topping: t, img, fill, label };
  }

  protected layoutStation(v: Viewport): void {
    const L = LAYOUT[v.orientation];
    const c = v.content;
    this.boardPos = { x: c.x + L.board.x, y: c.y + L.board.y, size: L.board.size };
    const { x, y, size } = this.boardPos;
    this.board.setPosition(x, y).setDisplaySize(size, size);
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
    this.jars.forEach((jar, i) => {
      const jx = c.x + L.jars.x + (i - (n - 1) / 2) * L.jars.step;
      const jy = c.y + L.jars.y;
      jar.img.setPosition(jx, jy).setScale(L.jars.scale);
      jar.fill.setPosition(jx, jy).setScale(L.jars.scale);
      jar.label.setPosition(jx, jy + 130 * L.jars.scale + 10);
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
    if (!work) this.instruction.setText(s.shelf.length ? 'tap a glazed donut to top it' : 'no glazed donuts: glaze some first!');
    else if (!this.jars.length) this.instruction.setText("nothing on today's menu needs toppings");
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

  private select(toppingId: string): void {
    this.selected = toppingId;
    this.refresh();
  }

  private startShake(p: Phaser.Input.Pointer): void {
    const s = session();
    if (!s.toppingWork) {
      this.flash(s.shelf.length ? 'take a donut from the shelf first' : 'glaze some donuts first');
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
      return;
    }
    this.shaking = true;
    this.lastEmit = this.time.now - balance.toppings.sprinkleEveryMs;
    this.handJar.setScale(0.6);
    this.handFill.setTexture(this.jarFillTexture(t)).setScale(0.6);
    this.hand.setVisible(true).setAngle(180);
    this.tweens.killTweensOf(this.hand);
    this.tweens.add({ targets: this.hand, angle: { from: 170, to: 190 }, duration: 80, yoyo: true, repeat: -1 });
  }

  private stopShake(): void {
    if (!this.shaking) return;
    this.shaking = false;
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
    f.fellOff = false;
    f.toppingId = t.id;
    f.rand = Math.random();
    const px = (t.size * this.boardPos.size) / 2 / ((PIECE_TEX_R * PIECE_TEX) / 2);
    f.img.setTexture(this.pieceTexture(t)).setScale(px).setRotation(f.rand * Math.PI * 2).setAlpha(1).setPosition(f.fromX, f.fromY).setVisible(true);
  }

  override update(time: number): void {
    const work = session().toppingWork;
    const tb = balance.toppings;

    if (this.shaking && work) {
      this.hand.setPosition(this.fingerX, this.fingerY - JAR_LIFT);
      const t = this.selectedTopping();
      if (t) {
        // Steady stream whatever the frame rate: a slow frame releases the pieces it owes (up to a few).
        if (time - this.lastEmit > tb.sprinkleEveryMs * 4) this.lastEmit = time - tb.sprinkleEveryMs * 4;
        while (time - this.lastEmit >= tb.sprinkleEveryMs && !work.full) {
          this.lastEmit += tb.sprinkleEveryMs;
          this.emit(t, time, this.fingerX, this.fingerY, tb.scatter);
        }
      }
    }

    for (const f of this.falling) {
      if (!f.active) continue;
      const k = (time - f.startAt) / tb.fallMs;
      if (f.fellOff) {
        // Tumbling off the donut: keep falling and fade out.
        f.img.setPosition(f.x, f.y + (k - 1) * 220).setAlpha(Math.max(0, 1 - (k - 1) * 2.5));
        if (k >= 1.4) {
          f.active = false;
          f.img.setVisible(false);
        }
        continue;
      }
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
  }

  /** A piece reaches the donut: it sticks (drawn on the board) or falls off. */
  private land(f: Falling): void {
    const work = session().toppingWork;
    f.img.setPosition(f.x, f.y);
    if (!work) {
      f.active = false;
      f.img.setVisible(false);
      return;
    }
    const { x, y, size } = this.boardPos;
    const piece = work.add(f.toppingId, (f.x - x) / (size / 2), (f.y - y) / (size / 2), f.rand);
    this.dirty = true;
    if (piece?.on) {
      const t = menu.toppings.find((tp) => tp.id === f.toppingId)!;
      drawToppingPiece(this.canvas.context, ART_SIZE, piece, t);
      f.active = false;
      f.img.setVisible(false);
    } else {
      f.fellOff = true;
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
    if (!this.selected && this.jars.length === 1) this.selected = this.jars[0]!.topping.id;
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
