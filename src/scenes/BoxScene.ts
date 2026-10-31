import Phaser from 'phaser';
import { TextureKeys } from '../assets/keys';
import { audio, balance, menu, session } from '../systems/services';
import { Button } from '../ui/Button';
import { donutIcon, pruneDonutIcons } from '../ui/donutArt';
import type { Viewport } from '../ui/layout';
import { COLORS, CSS, FONT_FAMILY } from '../ui/theme';
import { TicketCard } from '../ui/TicketCard';
import { getViewport } from '../ui/viewport';
import { getHud } from './flow';
import { listen } from './listen';
import { SceneKeys } from './sceneKeys';
import { StationScene } from './StationScene';

const SHELF_SLOTS = 6;
/** Most slots any box has (the domochi box). */
const MAX_SLOTS = 12;

const LAYOUT = {
  portrait: {
    shelf: { x: 40, y: 230, w: 1000, h: 140, size: 110 },
    box: { x: 540, y: 690, w: 960, h: 500, wideCols: 4 },
    card: { x: 540, y: 1200, scale: 0.85 },
    hint: { x: 540, y: 1200 },
    serve: { x: 540, y: 1470, scale: 1 },
  },
  landscape: {
    shelf: { x: 1000, y: 160, w: 880, h: 120, size: 92 },
    box: { x: 520, y: 430, w: 920, h: 580, wideCols: 4 },
    card: { x: 1440, y: 470, scale: 0.75 },
    hint: { x: 1440, y: 470 },
    serve: { x: 1440, y: 705, scale: 0.85 },
  },
} as const;

/**
 * Pack the selected order: tap (or drag) finished donuts from the shelf into
 * the box's slots in the ticket's order, then close the lid. Closing hands the
 * box straight to the customer.
 */
export class BoxScene extends StationScene {
  private shelfBg!: Phaser.GameObjects.Graphics;
  private shelfLabel!: Phaser.GameObjects.Text;
  private shelfImgs: Phaser.GameObjects.Image[] = [];
  private boxBody!: Phaser.GameObjects.Graphics;
  private slotNumbers: Phaser.GameObjects.Text[] = [];
  private slotImgs: Phaser.GameObjects.Image[] = [];
  private lid!: Phaser.GameObjects.Container;
  private lidImg!: Phaser.GameObjects.Image;
  private serveButton!: Button;
  private hint!: Phaser.GameObjects.Text;
  private instruction!: Phaser.GameObjects.Text;
  private flashText!: Phaser.GameObjects.Text;
  private card: TicketCard | null = null;

  private shelfPos = { x: 0, y: 0, step: 0, size: 0 };
  private boxArea = { x: 0, y: 0, w: 0, h: 0 };
  /** Slot centres and size for the current box. */
  private slots: { x: number; y: number }[] = [];
  private slotSize = 0;
  private shownLayout = '';
  private closing = false;

  constructor() {
    super(SceneKeys.Box, 'Box Station', 0x5a6b4a, null);
  }

  protected override headerPosition(v: Viewport) {
    if (v.orientation === 'landscape') return { x: v.content.x + 1440, titleY: v.content.y + 45, subtitleY: v.content.y + 100 };
    return super.headerPosition(v);
  }

  protected buildStation(): void {
    this.card = null;
    this.shelfImgs = [];
    this.slotImgs = [];
    this.slotNumbers = [];
    this.shownLayout = '';
    this.closing = false;
    this.input.dragDistanceThreshold = 16;

    this.shelfBg = this.add.graphics();
    this.shelfLabel = this.add
      .text(0, 0, 'shelf', { fontFamily: FONT_FAMILY, fontSize: '28px', fontStyle: 'bold', color: CSS.muted })
      .setOrigin(0.5)
      .setAngle(-90);
    this.boxBody = this.add.graphics();
    for (let i = 0; i < MAX_SLOTS; i++) {
      this.slotNumbers.push(
        this.add.text(0, 0, String(i + 1), { fontFamily: FONT_FAMILY, fontSize: '40px', fontStyle: 'bold', color: '#8a6a45' }).setOrigin(0.5).setVisible(false),
      );
    }
    for (let i = 0; i < MAX_SLOTS; i++) this.slotImgs.push(this.makeSlotDonut(i));
    for (let i = 0; i < SHELF_SLOTS; i++) this.shelfImgs.push(this.makeShelfDonut(i));

    this.lidImg = this.add.image(0, 0, TextureKeys.DonutBox);
    const logo = this.add.image(0, 0, TextureKeys.Logo).setDisplaySize(240, 240);
    this.lid = this.add.container(0, 0, [this.lidImg, logo]).setDepth(30).setVisible(false).setName('box-lid');

    const text = (size: number, color: string, bold = false) =>
      this.add.text(0, 0, '', { fontFamily: FONT_FAMILY, fontSize: `${size}px`, fontStyle: bold ? 'bold' : 'normal', color, align: 'center' }).setOrigin(0.5);
    this.hint = text(40, CSS.cream).setName('box-hint');
    this.instruction = text(34, CSS.muted).setName('box-instruction');
    this.flashText = text(48, CSS.ink, true).setBackgroundColor(CSS.cream).setPadding(24, 14, 24, 14).setDepth(40).setVisible(false).setName('box-flash');
    this.serveButton = new Button(this, 0, 0, 'Close lid & serve', () => this.serve(), { width: 640, name: 'btn-serve' });
    listen(this, session().events, 'changed', () => this.refresh());
  }

  // ---- Building blocks -----------------------------------------------------------

  private makeShelfDonut(i: number): Phaser.GameObjects.Image {
    const img = this.add.image(0, 0, TextureKeys.DonutFry).setVisible(false).setName(`box-shelf-${i}`).setDepth(5);
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
      const slot = this.slotAt(p.worldX, p.worldY);
      if (slot >= 0) this.pack(i, slot, img.x, img.y);
      this.refresh();
    });
    img.on(Phaser.Input.Events.POINTER_UP, () => {
      if (!dragged) this.pack(i, undefined, img.x, img.y);
    });
    return img;
  }

  private makeSlotDonut(i: number): Phaser.GameObjects.Image {
    const img = this.add.image(0, 0, TextureKeys.DonutFry).setVisible(false).setName(`box-slot-${i}`).setDepth(6);
    img.setInteractive({ draggable: true, useHandCursor: true });
    let dragged = false;
    img.on(Phaser.Input.Events.POINTER_DOWN, () => (dragged = false));
    img.on(Phaser.Input.Events.DRAG_START, () => {
      dragged = true;
      img.setDepth(25);
    });
    img.on(Phaser.Input.Events.DRAG, (_p: Phaser.Input.Pointer, x: number, y: number) => img.setPosition(x, y));
    img.on(Phaser.Input.Events.DRAG_END, (p: Phaser.Input.Pointer) => {
      img.setDepth(6);
      const to = this.slotAt(p.worldX, p.worldY);
      if (to >= 0) session().moveBoxDonut(i, to);
      else if (!this.inBox(p.worldX, p.worldY)) this.unpack(i);
      this.refresh();
    });
    // Tap a boxed donut to take it back out.
    img.on(Phaser.Input.Events.POINTER_UP, () => {
      if (!dragged) this.unpack(i);
    });
    return img;
  }

  protected layoutStation(v: Viewport): void {
    const L = LAYOUT[v.orientation];
    const c = v.content;
    const sh = L.shelf;
    this.shelfBg.clear();
    this.shelfBg.fillStyle(0x2b2522);
    this.shelfBg.fillRoundedRect(c.x + sh.x, c.y + sh.y, sh.w, sh.h, 18);
    this.shelfBg.lineStyle(5, COLORS.ink);
    this.shelfBg.strokeRoundedRect(c.x + sh.x, c.y + sh.y, sh.w, sh.h, 18);
    this.shelfPos = { x: c.x + sh.x + 70 + sh.size / 2, y: c.y + sh.y + sh.h / 2, step: Math.min(sh.size * 1.35, (sh.w - 160) / (SHELF_SLOTS - 1)), size: sh.size };
    this.shelfLabel.setPosition(c.x + sh.x + 30, c.y + sh.y + sh.h / 2);
    this.boxArea = { x: c.x + L.box.x, y: c.y + L.box.y, w: L.box.w, h: L.box.h };
    this.hint.setPosition(c.x + L.hint.x, c.y + L.hint.y);
    this.serveButton.setPosition(c.x + L.serve.x, c.y + L.serve.y).setScale(L.serve.scale);
    this.shownLayout = '';
    this.refresh();
  }

  /** Lay out the open box for `size` slots: a grid that fits the box area, drawn as card with dimples. */
  private layoutBox(size: number, ordered: number): void {
    const v = getViewport(this);
    const key = `${v.width}x${v.height}:${size}:${ordered}`;
    if (key === this.shownLayout) return;
    this.shownLayout = key;
    const a = this.boxArea;
    const wide = LAYOUT[v.orientation].box.wideCols;
    const cols = size <= 3 ? size : size <= 6 ? 3 : wide;
    const rows = Math.ceil(size / cols);
    const cell = Math.min((a.w - 60) / cols, (a.h - 60) / rows, 260);
    const bw = cols * cell + 60;
    const bh = rows * cell + 60;
    this.slotSize = cell * 0.86;
    this.slots = [];
    for (let i = 0; i < size; i++) {
      this.slots.push({ x: a.x - bw / 2 + 30 + cell * ((i % cols) + 0.5), y: a.y - bh / 2 + 30 + cell * (Math.floor(i / cols) + 0.5) });
    }

    const g = this.boxBody;
    g.clear();
    if (!size) {
      for (const t of this.slotNumbers) t.setVisible(false);
      return;
    }
    g.fillStyle(0x000000, 0.25);
    g.fillRoundedRect(a.x - bw / 2 + 10, a.y - bh / 2 + 14, bw, bh, 26);
    g.fillStyle(0xd8b58a);
    g.fillRoundedRect(a.x - bw / 2, a.y - bh / 2, bw, bh, 26);
    g.lineStyle(7, COLORS.ink);
    g.strokeRoundedRect(a.x - bw / 2, a.y - bh / 2, bw, bh, 26);
    this.slots.forEach((s, i) => {
      // Slots past the order are dimmer: nothing should go there.
      g.fillStyle(i < ordered ? 0xc09a6c : 0xcdb08a);
      g.fillCircle(s.x, s.y, this.slotSize / 2);
      g.lineStyle(3, 0xa47e52, i < ordered ? 1 : 0.4);
      g.strokeCircle(s.x, s.y, this.slotSize / 2);
    });
    this.slotNumbers.forEach((t, i) => {
      const s = this.slots[i];
      t.setVisible(!!s && i < ordered);
      if (s) t.setPosition(s.x, s.y).setFontSize(Math.round(Math.min(48, this.slotSize * 0.3)));
    });
    // The lid covers the whole box.
    this.lidImg.setDisplaySize(bw, bh);
    this.lid.setPosition(a.x, a.y);
  }

  // ---- State → screen -----------------------------------------------------------

  private refresh(): void {
    const s = session();
    const v = getViewport(this);
    const L = LAYOUT[v.orientation];
    const c = v.content;
    pruneDonutIcons(this);

    this.shelfImgs.forEach((img, i) => {
      const d = s.shelf[i];
      img.setVisible(!!d);
      if (d) img.setTexture(donutIcon(this, d)).setPosition(this.shelfPos.x + i * this.shelfPos.step, this.shelfPos.y).setDisplaySize(this.shelfPos.size, this.shelfPos.size);
    });

    this.card?.destroy();
    this.card = null;
    const active = s.activeTicket;
    const size = s.boxSize;
    this.layoutBox(size, active?.order.flavors.length ?? 0);
    this.slotImgs.forEach((img, i) => {
      const d = i < size ? s.box[i] : undefined;
      img.setVisible(!!d);
      const spot = this.slots[i];
      if (d && spot) img.setTexture(donutIcon(this, d)).setPosition(spot.x, spot.y).setDisplaySize(this.slotSize, this.slotSize);
    });

    if (!active) {
      this.hint.setText('no order selected.\ntake an order in the Lobby,\nthen tap its ticket up top.').setVisible(true);
      this.instruction.setVisible(false);
    } else {
      this.hint.setVisible(false);
      this.card = new TicketCard(this, c.x + L.card.x, c.y + L.card.y, active, menu).setScale(L.card.scale);
      const box = menu.boxes.find((b) => b.id === active.order.boxId);
      const n = active.order.flavors.length;
      // Under the box (portrait) or under the ticket (landscape).
      const below = v.orientation === 'portrait' ? this.boxArea.y + this.boxArea.h / 2 + 40 : c.y + L.card.y + (this.card.cardHeight * L.card.scale) / 2 + 40;
      this.instruction
        .setText(`${box?.name ?? 'box'}: fill slots 1–${n} in the ticket's order`)
        .setPosition(v.orientation === 'portrait' ? this.boxArea.x : c.x + L.card.x, below)
        .setVisible(true);
    }
    const shelfN = s.shelf.length;
    this.setSubtitle(`shelf ${shelfN}/${balance.glaze.shelfCapacity}${active ? ` · ${s.boxCount} in the box` : ''}`);
    this.serveButton.setEnabled(!!active && s.boxCount > 0 && !this.closing);
  }

  // ---- Actions ----------------------------------------------------------------

  /** A shelf donut into the box (a given slot, or the next free one), flying from (x, y). */
  private pack(shelfIndex: number, slot: number | undefined, x: number, y: number): void {
    const s = session();
    if (this.closing) return;
    if (!s.activeTicket) {
      this.flash('pick an order first (tap its ticket)');
      return;
    }
    const d = s.shelf[shelfIndex];
    if (!d) return;
    const key = donutIcon(this, d);
    const to = s.boxDonut(shelfIndex, slot);
    if (to < 0) {
      this.flash('the box is full!');
      return;
    }
    const spot = this.slots[to]!;
    const img = this.slotImgs[to]!;
    img.setVisible(false);
    const ghost = this.add.image(x, y, key).setDisplaySize(this.shelfPos.size, this.shelfPos.size).setDepth(20);
    this.tweens.add({
      targets: ghost,
      x: spot.x,
      y: spot.y,
      displayWidth: this.slotSize,
      displayHeight: this.slotSize,
      duration: 260,
      ease: 'Cubic.Out',
      onComplete: () => {
        ghost.destroy();
        if (session().box[to]) img.setVisible(true);
      },
    });
  }

  private unpack(slot: number): void {
    if (this.closing) return;
    if (!session().unboxDonut(slot)) this.flash('the shelf is full!');
  }

  private slotAt(x: number, y: number): number {
    const r = this.slotSize * 0.6;
    return this.slots.findIndex((s) => Phaser.Math.Distance.Between(x, y, s.x, s.y) < r);
  }

  private inBox(x: number, y: number): boolean {
    const a = this.boxArea;
    return Math.abs(x - a.x) < a.w / 2 && Math.abs(y - a.y) < a.h / 2;
  }

  /** Close the lid (a quick flip down), then hand the box to the customer. */
  private serve(): void {
    const s = session();
    if (!s.activeTicket || this.closing) return;
    if (!s.boxCount) {
      this.flash('put the donuts in the box first');
      return;
    }
    this.closing = true;
    this.time.delayedCall(300, () => audio().play('lid'));
    this.serveButton.setEnabled(false);
    const full = this.lidImg.displayHeight;
    this.lid.setVisible(true).setScale(1, 0.05).setY(this.boxArea.y - full / 2);
    this.tweens.add({
      targets: this.lid,
      scaleY: 1,
      y: this.boxArea.y,
      duration: 320,
      ease: 'Cubic.In',
      onComplete: () => {
        this.time.delayedCall(250, () => {
          this.closing = false;
          this.lid.setVisible(false);
          const t = session().activeTicket;
          if (!t) return;
          const served = session().serveActiveTicket();
          getHud(this).goTo(SceneKeys.Lobby);
          this.scene.launch(SceneKeys.Serve, { ticketNo: served.ticket.no, waitMs: served.waitMs });
        });
      },
    });
  }

  private flash(text: string): void {
    this.tweens.killTweensOf(this.flashText);
    this.flashText.setText(text).setVisible(true).setAlpha(1).setPosition(this.boxArea.x, this.boxArea.y);
    this.tweens.add({ targets: this.flashText, alpha: 0, delay: 1300, duration: 400, onComplete: () => this.flashText.setVisible(false) });
  }
}
