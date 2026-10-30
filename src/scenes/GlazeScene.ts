import Phaser from 'phaser';
import { TextureKeys } from '../assets/keys';
import { ringBallCenters, ringBallRadius } from '../stations/donutGeometry';
import { fryColor, type FriedDonut } from '../stations/fry';
import type { GlazedDonut, GlazeLayer, GlazeWork, PourCheck } from '../stations/glaze';
import type { Glaze } from '../systems/menu';
import { flavorsForDay } from '../systems/menu';
import { balance, menu, session } from '../systems/services';
import { Button } from '../ui/Button';
import { hexToNumber } from '../ui/DonutIcon';
import type { Viewport } from '../ui/layout';
import { COLORS, CSS, FONT_FAMILY } from '../ui/theme';
import { listen } from './listen';
import { SceneKeys } from './sceneKeys';
import { StationScene } from './StationScene';

/** Paint canvas resolution (px per side) for the donut on the board. */
const CANVAS = 420;
const CANVAS_KEY = 'glaze-paint';
/** Shelf icon texture size. */
const ICON = 128;
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

const LAYOUT = {
  portrait: {
    tray: { x: 40, y: 230, w: 1000, h: 140, size: 110 },
    board: { x: 540, y: 660, size: 520 },
    instruction: { x: 540, y: 960 },
    readout: { x: 540, y: 1010 },
    cups: { x: 540, y: 1110, step: 140, scale: 0.75 },
    shelf: { x: 40, y: 1250, w: 820, h: 120, size: 90 },
    trash: { x: 960, y: 1310, size: 130 },
    buttons: { y: 1460, redoX: 270, doneX: 800, scale: 1 },
  },
  landscape: {
    tray: { x: 1000, y: 160, w: 880, h: 120, size: 92 },
    board: { x: 480, y: 360, size: 500 },
    instruction: { x: 480, y: 670 },
    readout: { x: 480, y: 720 },
    cups: { x: 1440, y: 380, step: 120, scale: 0.65 },
    shelf: { x: 1000, y: 510, w: 700, h: 110, size: 80 },
    trash: { x: 1800, y: 565, size: 110 },
    buttons: { y: 705, redoX: 1250, doneX: 1620, scale: 0.85 },
  },
} as const;

export class GlazeScene extends StationScene {
  private board!: Phaser.GameObjects.Image;
  private paint!: Phaser.GameObjects.Image;
  private canvas!: Phaser.Textures.CanvasTexture;
  private bubbles!: Phaser.GameObjects.Graphics;
  private boardZone!: Phaser.GameObjects.Zone;
  private trayBg!: Phaser.GameObjects.Graphics;
  private trayLabel!: Phaser.GameObjects.Text;
  private shelfLabel!: Phaser.GameObjects.Text;
  private trayImgs: Phaser.GameObjects.Image[] = [];
  private shelfImgs: Phaser.GameObjects.Image[] = [];
  private trash!: Phaser.GameObjects.Image;
  private cups: CupView[] = [];
  private cupHighlight!: Phaser.GameObjects.Graphics;
  private handCup!: Phaser.GameObjects.Image;
  private drops: Drop[] = [];
  private instruction!: Phaser.GameObjects.Text;
  private readout!: Phaser.GameObjects.Text;
  private flashText!: Phaser.GameObjects.Text;
  private redoButton!: Button;
  private doneButton!: Button;

  private boardPos = { x: 0, y: 0, size: 1 };
  private trayPos = { x: 0, y: 0, step: 0, size: 0 };
  private shelfPos = { x: 0, y: 0, step: 0, size: 0 };
  private cupScale = 1;
  private selected: string | null = null;
  private pouring = false;
  private fingerX = 0;
  private fingerY = 0;
  private stroke = 0;
  private nextDrop = 0;
  private lastLand = { stroke: -1, nx: 0, ny: 0 };
  private dirty = false;
  private shownWork: GlazeWork | null = null;
  /** Shelf icon textures we've made, by donut id (removed when the donut leaves the shelf). */
  private iconKeys = new Map<number, string>();

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
    this.iconKeys = new Map();
    this.selected = null;
    this.pouring = false;
    this.shownWork = null;
    this.input.dragDistanceThreshold = 16;

    this.trayBg = this.add.graphics();
    const label = (s: string) => this.add.text(0, 0, s, { fontFamily: FONT_FAMILY, fontSize: '28px', fontStyle: 'bold', color: CSS.muted }).setOrigin(0.5).setAngle(-90);
    this.trayLabel = label('rack');
    this.shelfLabel = label('glazed');
    for (let i = 0; i < SLOTS; i++) this.trayImgs.push(this.makeTrayDonut(i));
    for (let i = 0; i < SLOTS; i++) this.shelfImgs.push(this.makeShelfDonut(i));
    this.trash = this.add.image(0, 0, TextureKeys.TrashBin).setName('glaze-trash');

    this.board = this.add.image(0, 0, TextureKeys.DonutFry).setName('glaze-donut');
    if (this.textures.exists(CANVAS_KEY)) this.textures.remove(CANVAS_KEY);
    this.canvas = this.textures.createCanvas(CANVAS_KEY, CANVAS, CANVAS)!;
    this.paint = this.add.image(0, 0, CANVAS_KEY);
    this.bubbles = this.add.graphics();
    this.boardZone = this.add.zone(0, 0, 1, 1).setInteractive({ useHandCursor: true }).setName('glaze-board');

    // Cups for every glaze used by today's flavours (base coats first, then drizzles).
    const used = new Set(flavorsForDay(menu, session().day).flatMap((f) => [f.glaze, ...(f.drizzle ? [f.drizzle] : [])]));
    this.cupHighlight = this.add.graphics();
    for (const glaze of menu.glazes.filter((g) => used.has(g.id))) this.cups.push(this.makeCup(glaze));

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
    this.events.on(Phaser.Scenes.Events.SLEEP, this.stopPour, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.SLEEP, this.stopPour, this);
      if (this.textures.exists(CANVAS_KEY)) this.textures.remove(CANVAS_KEY);
      for (const key of this.iconKeys.values()) if (this.textures.exists(key)) this.textures.remove(key);
    });
    listen(this, session().events, 'changed', () => this.refresh());
  }

  // ---- Building blocks -----------------------------------------------------------

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
      if (this.overTrash(p.worldX, p.worldY) && session().trashRackDonut(i)) this.toTrash(p.worldX, p.worldY, img);
      this.refresh();
    });
    img.on(Phaser.Input.Events.POINTER_UP, () => {
      if (!dragged) this.takeFromTray(i);
    });
    return img;
  }

  private makeShelfDonut(i: number): Phaser.GameObjects.Image {
    const img = this.add.image(0, 0, TextureKeys.DonutFry).setVisible(false).setName(`glaze-shelf-${i}`).setDepth(5);
    img.setInteractive({ draggable: true, useHandCursor: true });
    img.on(Phaser.Input.Events.DRAG_START, () => img.setDepth(25));
    img.on(Phaser.Input.Events.DRAG, (_p: Phaser.Input.Pointer, x: number, y: number) => img.setPosition(x, y));
    img.on(Phaser.Input.Events.DRAG_END, (p: Phaser.Input.Pointer) => {
      img.setDepth(5);
      if (this.overTrash(p.worldX, p.worldY) && session().trashShelfDonut(i)) this.toTrash(p.worldX, p.worldY, img);
      this.refresh();
    });
    return img;
  }

  private makeCup(glaze: Glaze): CupView {
    const sifter = glaze.style === 'dust';
    const img = this.add.image(0, 0, sifter ? TextureKeys.SugarSifter : TextureKeys.GlazeCup).setName(`cup-${glaze.id}`);
    if (!sifter) img.setTint(hexToNumber(glaze.color));
    img.setInteractive({ useHandCursor: true });
    img.on(Phaser.Input.Events.POINTER_DOWN, () => this.select(glaze.id));
    const label = this.add
      .text(0, 0, glaze.name.replace(/ glaze$/, ''), { fontFamily: FONT_FAMILY, fontSize: '24px', color: CSS.cream, align: 'center', wordWrap: { width: 160 } })
      .setOrigin(0.5, 0);
    return { glaze, img, label };
  }

  protected layoutStation(v: Viewport): void {
    const L = LAYOUT[v.orientation];
    const c = v.content;
    this.boardPos = { x: c.x + L.board.x, y: c.y + L.board.y, size: L.board.size };
    const { x, y, size } = this.boardPos;
    this.board.setPosition(x, y).setDisplaySize(size, size);
    this.paint.setPosition(x, y).setDisplaySize(size, size);
    // Pouring is accepted a bit outside the donut too (that's spill).
    this.boardZone.setPosition(x, y).setSize(size * 1.3, size * 1.3);
    this.drawBubbles();

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
    const n = this.cups.length;
    this.cups.forEach((cup, i) => {
      const cx = c.x + L.cups.x + (i - (n - 1) / 2) * L.cups.step;
      cup.img.setPosition(cx, c.y + L.cups.y).setScale(L.cups.scale);
      cup.label.setPosition(cx, c.y + L.cups.y + 68 * L.cups.scale + 8).setScale(Math.min(1, L.cups.scale + 0.2));
    });
    this.handCup.setScale(1);

    this.instruction.setPosition(c.x + L.instruction.x, c.y + L.instruction.y);
    this.readout.setPosition(c.x + L.readout.x, c.y + L.readout.y);
    this.flashText.setPosition(x, y);
    this.redoButton.setPosition(c.x + L.buttons.redoX, c.y + L.buttons.y).setScale(L.buttons.scale);
    this.doneButton.setPosition(c.x + L.buttons.doneX, c.y + L.buttons.y).setScale(L.buttons.scale);
    this.shownWork = null; // force a canvas redraw at the new size
    this.refresh();
  }

  // ---- State → screen -----------------------------------------------------------

  private refresh(): void {
    const s = session();
    const work = s.glazeWork;

    // Tray (rack donuts) and shelf (glazed donuts)
    this.trayImgs.forEach((img, i) => {
      const d = s.rack[i];
      img.setVisible(!!d);
      if (d) img.setPosition(this.trayPos.x + i * this.trayPos.step, this.trayPos.y).setDisplaySize(this.trayPos.size, this.trayPos.size).setTint(this.tintOf(d));
    });
    this.syncIcons(s.shelf);
    this.shelfImgs.forEach((img, i) => {
      const d = s.shelf[i];
      img.setVisible(!!d);
      if (d) {
        img.setTexture(this.iconKeys.get(d.id)!).clearTint();
        img.setPosition(this.shelfPos.x + i * this.shelfPos.step, this.shelfPos.y).setDisplaySize(this.shelfPos.size, this.shelfPos.size);
      }
    });

    // Board
    this.board.setVisible(!!work);
    this.paint.setVisible(!!work);
    this.bubbles.setVisible(!!work);
    if (work) this.board.setTint(this.tintOf(work.fry));
    if (work !== this.shownWork) {
      this.shownWork = work;
      this.redrawCanvas();
    }

    this.setSubtitle(`rack ${s.rack.length} · glazed shelf ${s.shelf.length}/${balance.glaze.shelfCapacity}`);
    if (!work) this.instruction.setText(s.rack.length ? 'tap a donut on the rack to glaze it' : 'no fried donuts: fry some first!');
    else if (!work.hasGlaze) this.instruction.setText('pick a cup, then pour over the donut');
    else this.instruction.setText('add a drizzle, or tap Done');
    this.refreshControls();
  }

  private refreshControls(): void {
    const s = session();
    const work = s.glazeWork;
    this.redoButton.setEnabled(!!work);
    this.doneButton.setEnabled(!!work && work.hasGlaze && !s.shelfFull);

    this.cupHighlight.clear();
    const cup = this.cups.find((c) => c.glaze.id === this.selected);
    if (cup) {
      const w = 170 * this.cupScale;
      this.cupHighlight.lineStyle(7, COLORS.pink);
      this.cupHighlight.strokeRoundedRect(cup.img.x - w / 2, cup.img.y - 95 * this.cupScale, w, 260 * this.cupScale, 20);
    }

    const layer = work?.currentLayer ?? work?.layers[work.layers.length - 1];
    if (!work) this.readout.setText('');
    else if (!layer) this.readout.setText(this.selected ? 'press on the donut to pour' : 'pick a cup');
    else if (layer.kind === 'drizzle') this.readout.setText(`drizzle ${Math.round(layer.coverage * 100)}% · spill ${Math.round(layer.spill * 100)}%`);
    else this.readout.setText(`glaze ${Math.round(layer.coverage * 100)}% · spill ${Math.round(layer.spill * 100)}%`);
  }

  private tintOf(d: FriedDonut): number {
    return fryColor((d.a + d.b) / 2);
  }

  // ---- Pouring ----------------------------------------------------------------

  private toNorm(x: number, y: number): { nx: number; ny: number } {
    const { x: bx, y: by, size } = this.boardPos;
    return { nx: (x - bx) / (size / 2), ny: (y - by) / (size / 2) };
  }

  private select(glazeId: string): void {
    this.selected = glazeId;
    this.refreshControls();
  }

  private startPour(p: Phaser.Input.Pointer): void {
    const work = session().glazeWork;
    if (!work) {
      this.flash(session().rack.length ? 'take a donut from the rack first' : 'fry some donuts first');
      return;
    }
    if (!this.selected) {
      this.flash('pick a cup first!');
      return;
    }
    const check = work.canPour(this.selected);
    if (check !== 'ok') {
      this.flash(this.pourMessage(check));
      return;
    }
    this.pouring = true;
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
  }

  private stopPour(): void {
    if (!this.pouring) return;
    this.pouring = false;
    this.tweens.killTweensOf(this.handCup);
    this.handCup.setVisible(false);
  }

  private pourMessage(check: PourCheck): string {
    switch (check) {
      case 'hasBase':
        return 'this donut already has a glaze.\nRedo to start over';
      case 'hasDrizzle':
        return 'it already has a drizzle';
      case 'drizzleFirst':
        return 'glaze goes on before the drizzle';
      default:
        return "can't pour that";
    }
  }

  /** Where the stream leaves the cup (above the finger). */
  private lipFor(x: number, y: number): { lx: number; ly: number } {
    return { lx: x, ly: y - CUP_LIFT };
  }

  override update(time: number): void {
    const work = session().glazeWork;
    const fallMs = balance.glaze.fallMs;

    // While pouring, the cup follows the finger (spout right above it) and emits a drop each frame.
    if (this.pouring && work && this.selected) {
      const a = Phaser.Math.DegToRad(this.handCup.angle);
      const sx = SPOUT.x * Math.cos(a) - SPOUT.y * Math.sin(a);
      const sy = SPOUT.x * Math.sin(a) + SPOUT.y * Math.cos(a);
      const { lx, ly } = this.lipFor(this.fingerX, this.fingerY);
      this.handCup.setPosition(lx - sx, ly - sy);
      const d = this.drops[this.nextDrop]!;
      this.nextDrop = (this.nextDrop + 1) % DROPS;
      d.active = true;
      d.emitAt = time;
      d.x = this.fingerX;
      d.y = this.fingerY;
      d.stroke = this.stroke;
      d.glazeId = this.selected;
      const g = menu.glazes.find((x) => x.id === this.selected)!;
      d.circle.setFillStyle(hexToNumber(g.color)).setRadius(g.style === 'drizzle' ? 7 : g.style === 'dust' ? 5 : 15).setVisible(true);
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

    if (this.dirty) {
      this.dirty = false;
      this.canvas.refresh();
      this.refreshControls();
    }
  }

  /** A drop reaches the donut: glaze along the path from the previous drop of this pour. */
  private land(d: Drop): void {
    const work = session().glazeWork;
    if (!work) return;
    const { nx, ny } = this.toNorm(d.x, d.y);
    const same = this.lastLand.stroke === d.stroke;
    const x0 = same ? this.lastLand.nx : nx;
    const y0 = same ? this.lastLand.ny : ny;
    this.lastLand.stroke = d.stroke;
    this.lastLand.nx = nx;
    this.lastLand.ny = ny;
    if (!work.pour(d.glazeId, x0, y0, nx, ny)) return;
    const layer = work.currentLayer!;
    this.drawSegment(this.canvas.context, CANVAS, d.glazeId, x0, y0, nx, ny, layer.segments.length);
    this.dirty = true;
    if (layer.segments.length === 4) this.refresh(); // first glaze on this donut: update the instruction
  }

  // ---- Drawing ----------------------------------------------------------------

  /** Draw one poured segment in a glaze's style (with its speckles), onto any canvas. */
  private drawSegment(ctx: CanvasRenderingContext2D, size: number, glazeId: string, x0: number, y0: number, x1: number, y1: number, seed: number): void {
    const g = menu.glazes.find((x) => x.id === glazeId);
    if (!g) return;
    const half = size / 2;
    const r = balance.glaze.brushRadius[g.style] * half;
    const px = (v: number) => (v + 1) * half;
    let s = (Math.abs(seed) * 9301 + 49297) % 233280;
    const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    const len = Math.hypot(x1 - x0, y1 - y0) * half;

    if (g.style === 'dust') {
      const steps = Math.max(1, Math.ceil(len / (r * 0.5)));
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        const cx = px(x0 + (x1 - x0) * t);
        const cy = px(y0 + (y1 - y0) * t);
        for (let n = 0; n < 12; n++) {
          const a = rnd() * Math.PI * 2;
          const dist = Math.sqrt(rnd()) * r;
          ctx.beginPath();
          ctx.arc(cx + Math.cos(a) * dist, cy + Math.sin(a) * dist, (1.5 + rnd() * 2.5) * (size / CANVAS), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      return;
    }

    ctx.strokeStyle = g.color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = r * 2;
    ctx.beginPath();
    ctx.moveTo(px(x0), px(y0));
    ctx.lineTo(px(x1) + 0.01, px(y1));
    ctx.stroke();

    // Detail flecks: strawberry seeds, cookie crumbs, nut bits…
    if (g.speckles) {
      const count = Math.round(g.speckles.density * (len / r + 1) * 5);
      for (let n = 0; n < count; n++) {
        const t = rnd();
        const a = rnd() * Math.PI * 2;
        const dist = Math.sqrt(rnd()) * r * 0.85;
        ctx.fillStyle = g.speckles.colors[Math.floor(rnd() * g.speckles.colors.length)]!;
        ctx.beginPath();
        ctx.ellipse(
          px(x0 + (x1 - x0) * t) + Math.cos(a) * dist,
          px(y0 + (y1 - y0) * t) + Math.sin(a) * dist,
          (2 + rnd() * 3) * (size / CANVAS),
          (1.2 + rnd() * 1.6) * (size / CANVAS),
          rnd() * Math.PI,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }
  }

  private drawLayers(ctx: CanvasRenderingContext2D, size: number, layers: GlazeLayer[]): void {
    for (const layer of layers) {
      for (let k = 0; k < layer.segments.length; k += 4) {
        this.drawSegment(ctx, size, layer.glazeId, layer.segments[k]!, layer.segments[k + 1]!, layer.segments[k + 2]!, layer.segments[k + 3]!, k + 4);
      }
    }
  }

  private redrawCanvas(): void {
    const ctx = this.canvas.context;
    ctx.clearRect(0, 0, CANVAS, CANVAS);
    const work = session().glazeWork;
    if (work) this.drawLayers(ctx, CANVAS, work.allLayers);
    this.canvas.refresh();
  }

  /** Outline and gloss on each of the 8 balls (same geometry as the glaze maths). */
  private drawBubbles(): void {
    const { x, y, size } = this.boardPos;
    const half = size / 2;
    const gb = balance.glaze;
    const r = ringBallRadius(gb.ringRadius, 8, gb.ballOverlap) * half;
    const g = this.bubbles;
    g.clear();
    for (const p of ringBallCenters(0, 0, gb.ringRadius)) {
      const cx = x + p.x * half;
      const cy = y + p.y * half;
      g.lineStyle(5, COLORS.ink, 0.35);
      g.strokeCircle(cx, cy, r);
      g.lineStyle(8, 0xffffff, 0.35);
      g.beginPath();
      g.arc(cx, cy, r * 0.62, Math.PI * 1.08, Math.PI * 1.42);
      g.strokePath();
    }
  }

  /** Make a small picture of a glazed donut (fried ring + its glaze), for the shelf. */
  private makeIcon(d: GlazedDonut): string {
    const key = `glazed-${d.id}`;
    if (this.textures.exists(key)) return key;
    const tex = this.textures.createCanvas(key, ICON, ICON)!;
    const ctx = tex.context;
    const gb = balance.glaze;
    const half = ICON / 2;
    const r = ringBallRadius(gb.ringRadius, 8, gb.ballOverlap) * half;
    const balls = ringBallCenters(half, half, gb.ringRadius * half);
    const tint = this.tintOf(d.fry);
    ctx.fillStyle = `#${tint.toString(16).padStart(6, '0')}`;
    for (const p of balls) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    this.drawLayers(ctx, ICON, d.layers);
    ctx.strokeStyle = 'rgba(31,26,23,0.5)';
    ctx.lineWidth = 2;
    for (const p of balls) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    tex.refresh();
    return key;
  }

  /** Keep shelf icon textures in step with the shelf (make new ones, drop old ones). */
  private syncIcons(shelf: readonly GlazedDonut[]): void {
    const ids = new Set(shelf.map((d) => d.id));
    for (const [id, key] of this.iconKeys) {
      if (!ids.has(id)) {
        this.shelfImgs.forEach((img) => img.texture.key === key && img.setTexture(TextureKeys.DonutFry));
        if (this.textures.exists(key)) this.textures.remove(key);
        this.iconKeys.delete(id);
      }
    }
    for (const d of shelf) if (!this.iconKeys.has(d.id)) this.iconKeys.set(d.id, this.makeIcon(d));
  }

  // ---- Actions ----------------------------------------------------------------

  private takeFromTray(i: number): void {
    const s = session();
    if (s.glazeWork) {
      this.flash('finish (or redo) the donut on the board first');
      return;
    }
    const img = this.trayImgs[i]!;
    const from = { x: img.x, y: img.y, size: img.displayWidth, tint: img.tintTopLeft };
    if (!s.startGlazing(i)) return;
    // Slide it from the tray onto the board.
    const ghost = this.add.image(from.x, from.y, TextureKeys.DonutFry).setDisplaySize(from.size, from.size).setTint(from.tint).setDepth(15);
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
  }

  private redo(): void {
    const s = session();
    if (!s.glazeWork) return;
    this.stopPour();
    const snap = this.add.image(this.boardPos.x, this.boardPos.y, TextureKeys.DonutFry).setDisplaySize(this.boardPos.size, this.boardPos.size).setTint(this.board.tintTopLeft).setDepth(15);
    s.trashGlazing();
    this.toTrash(snap.x, snap.y, snap, true);
    this.flash('trashed: take another from the rack');
  }

  private done(): void {
    const s = session();
    const before = s.shelf.length;
    this.stopPour();
    const d = s.finishGlazing();
    if (!d) {
      if (s.shelfFull) this.flash('the glazed shelf is full!');
      return;
    }
    const key = this.iconKeys.get(d.id);
    if (key) {
      const ghost = this.add.image(this.boardPos.x, this.boardPos.y, key).setDisplaySize(this.boardPos.size, this.boardPos.size).setDepth(15);
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
  }

  private overTrash(x: number, y: number): boolean {
    return Phaser.Math.Distance.Between(x, y, this.trash.x, this.trash.y) < Math.max(this.trash.displayWidth, 150);
  }

  /** Fly a copy of a donut into the trash can. `owned` = destroy the passed image afterwards. */
  private toTrash(x: number, y: number, img: Phaser.GameObjects.Image, owned = false): void {
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
