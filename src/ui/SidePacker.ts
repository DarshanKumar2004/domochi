import Phaser from 'phaser';
import type { SideKind } from '../stations/sides';
import type { GameSession } from '../systems/GameSession';
import type { Menu } from '../systems/menu';
import { groupFlavors, sideItem, sidesOf } from '../systems/orders';
import { Button } from './Button';
import { drawSide } from './sideArt';
import { COLORS, CSS, FONT_FAMILY } from './theme';

const SLOTS = 6;

export interface PackerLayout {
  /** The ready row (rack or tray): first item's centre, step between items, item size. */
  ready: { x: number; y: number; step: number; size: number; cols?: number };
  /** The open box: centre and size. */
  box: { x: number; y: number; w: number; h: number };
  close: { x: number; y: number; scale: number };
  /** The order line (what to make and pack). */
  hint: { x: number; y: number; width: number };
}

/**
 * The cooling rack (or onigiri tray) and the selected order's box for it:
 * tap a ready item to pack it, tap a packed one to take it back out, then
 * close the box. The closed box waits for the order (it goes out with the
 * donuts at the Box station).
 */
export class SidePacker {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly readyZones: Phaser.GameObjects.Zone[] = [];
  private readonly boxZones: Phaser.GameObjects.Zone[] = [];
  private readonly hint: Phaser.GameObjects.Text;
  private readonly boxLabel: Phaser.GameObjects.Text;
  private readonly readyLabel: Phaser.GameObjects.Text;
  private readonly closeBtn: Button;
  private l: PackerLayout | null = null;

  constructor(
    scene: Phaser.Scene,
    private readonly kind: SideKind,
    private readonly session: () => GameSession,
    private readonly menu: Menu,
    private readonly flash: (text: string) => void,
    private readonly pressCount = 3,
  ) {
    this.g = scene.add.graphics().setDepth(4);
    for (let i = 0; i < SLOTS; i++) {
      const z = scene.add.zone(0, 0, 10, 10).setName(`${kind}-ready-${i}`).setInteractive({ useHandCursor: true });
      z.on(Phaser.Input.Events.POINTER_UP, () => this.pack(i));
      this.readyZones.push(z);
      const b = scene.add.zone(0, 0, 10, 10).setName(`${kind}-box-${i}`).setInteractive({ useHandCursor: true });
      b.on(Phaser.Input.Events.POINTER_UP, () => this.unpack(i));
      this.boxZones.push(b);
    }
    const text = (size: number, color: string) =>
      scene.add.text(0, 0, '', { fontFamily: FONT_FAMILY, fontSize: `${size}px`, color, align: 'center' }).setOrigin(0.5).setDepth(5);
    this.hint = text(30, CSS.cream).setName(`${kind}-order-hint`);
    this.boxLabel = text(28, '#8a6a45');
    this.readyLabel = text(28, CSS.muted).setText(kind === 'kolache' ? 'cooling rack' : 'onigiri tray');
    this.closeBtn = new Button(scene, 0, 0, 'Close box', () => this.close(), { width: 420, height: 130, name: `btn-close-${kind}` });
    this.closeBtn.setDepth(6).setWhy(() => `tap a ${kind === 'kolache' ? 'kolache on the rack' : 'onigiri on the tray'} to pack it first`);
  }

  layout(l: PackerLayout): void {
    this.l = l;
    this.hint.setPosition(l.hint.x, l.hint.y).setWordWrapWidth(l.hint.width);
    this.closeBtn.setPosition(l.close.x, l.close.y).setScale(l.close.scale);
    this.refresh();
  }

  private readyPos(i: number): { x: number; y: number } {
    const r = this.l!.ready;
    const cols = r.cols ?? SLOTS;
    return { x: r.x + (i % cols) * r.step, y: r.y + Math.floor(i / cols) * r.step };
  }

  private boxSlots(size: number): { x: number; y: number; cell: number }[] {
    const b = this.l!.box;
    const cols = size <= 3 ? size : 3;
    const rows = Math.ceil(size / cols);
    const cell = Math.min((b.w - 30) / cols, (b.h - 46) / rows);
    const out: { x: number; y: number; cell: number }[] = [];
    for (let i = 0; i < size; i++) {
      out.push({ x: b.x - (cols * cell) / 2 + cell * ((i % cols) + 0.5), y: b.y - (rows * cell) / 2 + 12 + cell * (Math.floor(i / cols) + 0.5), cell });
    }
    return out;
  }

  refresh(): void {
    const l = this.l;
    if (!l) return;
    const s = this.session();
    const g = this.g;
    const m = this.menu.sides?.[this.kind];
    g.clear();
    // The rack / tray.
    const ready = s.sideReady(this.kind);
    const r = l.ready;
    const cols = r.cols ?? SLOTS;
    const rows = Math.ceil(SLOTS / cols);
    g.fillStyle(0x2b2522);
    g.fillRoundedRect(r.x - r.size * 0.65, r.y - r.size * 0.65, r.step * (cols - 1) + r.size * 1.3, r.step * (rows - 1) + r.size * 1.3, 16);
    g.lineStyle(4, COLORS.ink);
    g.strokeRoundedRect(r.x - r.size * 0.65, r.y - r.size * 0.65, r.step * (cols - 1) + r.size * 1.3, r.step * (rows - 1) + r.size * 1.3, 16);
    this.readyLabel.setPosition(r.x + (r.step * (cols - 1)) / 2, r.y - r.size * 0.65 - 22);
    this.readyZones.forEach((z, i) => {
      const p = this.readyPos(i);
      const x = ready[i];
      z.setPosition(p.x, p.y).setSize(Math.max(r.step, 120), Math.max(r.step, 120));
      if (z.input) z.input.hitArea.setTo(0, 0, z.width, z.height);
      z.setVisible(!!x);
      if (x) drawSide(g, this.kind, p.x, p.y, r.size * 0.42, x, m, this.pressCount);
    });

    // The box for the selected order.
    const t = s.activeTicket;
    const choice = s.sideBoxChoice(this.kind);
    const wanted = t ? sidesOf(t.order, this.kind) : [];
    const packed = t?.sidePacks?.[this.kind];
    const b = l.box;
    const size = choice?.size ?? 2;
    g.fillStyle(0x000000, 0.22);
    g.fillRoundedRect(b.x - b.w / 2 + 8, b.y - b.h / 2 + 10, b.w, b.h, 20);
    g.fillStyle(this.kind === 'kolache' ? 0xe9d3ae : 0xf3f0e6, choice ? 1 : 0.45);
    g.fillRoundedRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h, 20);
    g.lineStyle(5, COLORS.ink, choice ? 1 : 0.4);
    g.strokeRoundedRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h, 20);
    const inBox = s.sideBoxOf(this.kind);
    const slots = this.boxSlots(size);
    this.boxZones.forEach((z, i) => {
      const sl = slots[i];
      z.setVisible(!!sl && !!choice && !!inBox[i]);
      if (!sl) return;
      z.setPosition(sl.x, sl.y).setSize(Math.max(sl.cell, 120), Math.max(sl.cell, 120));
      if (z.input) z.input.hitArea.setTo(0, 0, z.width, z.height);
      if (!choice) return;
      g.fillStyle(0x000000, 0.08);
      g.fillCircle(sl.x, sl.y, sl.cell * 0.4);
      const x = inBox[i];
      if (x) drawSide(g, this.kind, sl.x, sl.y, sl.cell * 0.36, x, m, this.pressCount);
    });
    this.boxLabel.setPosition(b.x, b.y - b.h / 2 + 20).setText(choice ? choice.name : packed ? 'packed ✓' : '');

    const names = groupFlavors(wanted)
      .map(({ flavorId, count }) => `${count} × ${sideItem(this.menu, this.kind, flavorId)?.name ?? flavorId}`)
      .join(', ');
    let hint: string;
    const plural = this.kind === 'kolache' ? 'kolaches' : 'onigiri';
    // Orders still waiting for this kind (to point at when the selected one has none).
    const others = s.openTickets.filter((x) => x !== t && sidesOf(x.order, this.kind).length && !x.sidePacks?.[this.kind]).map((x) => `#${x.no}`);
    const tapOthers = others.length ? `\ntap ticket ${others.slice(0, 3).join(', ')} to pack its ${plural}` : '';
    if (!t) hint = `pick an order (tap its ticket up top)${tapOthers}`;
    else if (!wanted.length) hint = `#${t.no} has no ${plural}${tapOthers}`; else if (packed) hint = `#${t.no}: ${names} packed ✓\ntake it to the Box station`;
    else hint = `#${t.no} wants ${names}\n${this.recipeHint(wanted)}`;
    this.hint.setText(hint);
    this.closeBtn.setVisible(!!choice).setEnabled(inBox.length > 0);
  }

  /** "sausage & cheese" / "strawberry cream cheese + posipka crumble" for each wanted item. */
  private recipeHint(wanted: readonly string[]): string {
    const m = this.menu.sides?.[this.kind];
    if (!m) return '';
    const parts = groupFlavors(wanted).map(({ flavorId }) => {
      const it = m.items.find((i) => i.id === flavorId);
      if (!it) return '';
      const f = m.fillings.find((x) => x.id === it.filling)?.name ?? it.filling;
      return [f, ...it.toppings.map((id) => m.toppings.find((x) => x.id === id)?.name ?? id)].join(' + ');
    });
    return parts.filter(Boolean).join(' · ');
  }

  private pack(i: number): void {
    const s = this.session();
    if (!s.sideReady(this.kind)[i]) return;
    if (!s.activeTicket) return this.flash('pick an order first (tap its ticket)');
    if (!s.sideBoxChoice(this.kind)) {
      return this.flash(s.activeTicket.sidePacks?.[this.kind] ? 'already packed for this order' : `this order has no ${this.kind === 'kolache' ? 'kolaches' : 'onigiri'}`);
    }
    if (s.packSide(this.kind, i) < 0) this.flash('the box is full!');
  }

  private unpack(i: number): void {
    if (!this.session().unpackSide(this.kind, i)) this.flash(this.kind === 'kolache' ? 'the rack is full!' : 'the tray is full!');
  }

  private close(): void {
    const s = this.session();
    const box = s.sideBoxChoice(this.kind);
    if (!box || !s.closeSideBox(this.kind)) return;
    this.flash(s.activeTicket?.sidePacks?.napkin?.includes(this.kind) ? 'out of boxes! it goes in a napkin' : `${box.name} packed ✓`);
  }
}
