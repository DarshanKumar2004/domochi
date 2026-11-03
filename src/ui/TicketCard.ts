import Phaser from 'phaser';
import type { Ticket } from '../systems/GameSession';
import type { Menu } from '../systems/menu';
import { groupFlavors, sideItem, sidesOf } from '../systems/orders';
import { SIDE_KINDS, type SideKind } from '../stations/sides';
import { makeSideIcon } from './sideArt';
import { addDonutIcon } from './DonutIcon';
import { COLORS, CSS, FONT_FAMILY } from './theme';

const WIDTH = 540;
const PAD = 26;
const ROW = 74;
/** Rows are taller in detail mode, to fit the recipe line. */
const DETAIL_ROW = 150;
const HEADER = 84;
const SIDE_ROW = 84;
const SIDE_DETAIL_ROW = 176;
const FOOTER = 60;

/** "strawberry glaze + white icing drizzle" etc.: what goes on a flavour, for the big ticket. */
export function recipeLine(flavorId: string, menu: Menu): string {
  const f = menu.flavors.find((x) => x.id === flavorId);
  if (!f) return '';
  const name = (id: string | undefined) => menu.glazes.find((g) => g.id === id)?.name ?? id ?? '';
  const parts = f.glaze ? [name(f.glaze)] : [];
  if (f.drizzle) parts.push(`${name(f.drizzle)} drizzle`);
  for (const t of f.toppings) parts.push(menu.toppings.find((x) => x.id === t)?.name ?? t);
  return parts.join(' + ');
}

/** "sausage & cheese" / "strawberry cream cheese + posipka crumble": what goes in a kolache or onigiri. */
export function sideRecipeLine(kind: SideKind, itemId: string, menu: Menu): string {
  const m = menu.sides?.[kind];
  const it = m?.items.find((i) => i.id === itemId);
  if (!m || !it) return '';
  const filling = m.fillings.find((f) => f.id === it.filling)?.name ?? it.filling;
  const extra = kind === 'onigiri' ? ['nori'] : ['egg wash'];
  return [`${filling} filling`, ...it.toppings.map((t) => m.toppings.find((x) => x.id === t)?.name ?? t), ...extra].join(' + ');
}

/**
 * Full order ticket: number, each flavor with a donut icon, and the box.
 * With `details`, each flavor also shows its recipe. Centred on (x, y).
 */
export class TicketCard extends Phaser.GameObjects.Container {
  readonly cardHeight: number;

  constructor(scene: Phaser.Scene, x: number, y: number, ticket: Ticket, menu: Menu, details = false) {
    super(scene, x, y);
    const groups = groupFlavors(ticket.order.flavors);
    const sideGroups = SIDE_KINDS.flatMap((kind) => groupFlavors(sidesOf(ticket.order, kind)).map((g) => ({ kind, ...g })));
    const row = details ? DETAIL_ROW : ROW;
    // Kolache and onigiri names are long: their rows get room for two lines.
    const sideRow = details ? SIDE_DETAIL_ROW : SIDE_ROW;
    const h = HEADER + groups.length * row + sideGroups.length * sideRow + FOOTER + (sideGroups.length ? 40 : 0);
    this.cardHeight = h;
    const top = -h / 2;
    const left = -WIDTH / 2;

    const bg = scene.make.graphics({}, false);
    bg.fillStyle(0x000000, 0.2);
    bg.fillRoundedRect(left, top + 8, WIDTH, h, 20);
    bg.fillStyle(COLORS.card);
    bg.fillRoundedRect(left, top, WIDTH, h, 20);
    bg.lineStyle(5, COLORS.ink);
    bg.strokeRoundedRect(left, top, WIDTH, h, 20);
    bg.lineStyle(3, COLORS.ink, 0.25);
    bg.lineBetween(left + PAD, top + HEADER - 12, -left - PAD, top + HEADER - 12);
    this.add(bg);

    const text = (tx: number, ty: number, s: string, size: number, bold = false, originX = 0, color: string = CSS.ink) =>
      this.add(
        scene.make
          .text(
            {
              x: tx,
              y: ty,
              text: s,
              style: {
                fontFamily: FONT_FAMILY,
                fontSize: `${size}px`,
                fontStyle: bold ? 'bold' : 'normal',
                color,
                wordWrap: { width: WIDTH - PAD * 2 - 80 },
              },
            },
            false,
          )
          .setOrigin(originX, 0.5),
      );

    const box = menu.boxes.find((b) => b.id === ticket.order.boxId);
    const n = ticket.order.flavors.length;
    text(left + PAD, top + HEADER / 2 - 6, `#${ticket.no}`, 52, true);
    text(-left - PAD, top + HEADER / 2 - 6, `${ticket.delivery ? 'pickup · ' : ''}${n} donut${n === 1 ? '' : 's'}${sideGroups.length ? ` + ${sideGroups.reduce((a, g) => a + g.count, 0)}` : ''}`, 34, false, 1);

    groups.forEach(({ flavorId, count }, i) => {
      const rowY = top + HEADER + row * i + row / 2;
      this.add(addDonutIcon(scene, left + PAD + 30, rowY, 64, flavorId, menu));
      const name = menu.flavors.find((f) => f.id === flavorId)?.name ?? flavorId;
      if (details) {
        text(left + PAD + 80, rowY - 32, `${count} × ${name}`, 38, true);
        text(left + PAD + 80, rowY + 26, recipeLine(flavorId, menu), 26, false, 0, "#6b5d52");
      } else {
        text(left + PAD + 80, rowY, `${count} × ${name}`, 38);
      }
    });

    sideGroups.forEach(({ kind, flavorId, count }, k) => {
      const rowY = top + HEADER + row * groups.length + sideRow * k + sideRow / 2;
      this.add(makeSideIcon(scene, left + PAD + 30, rowY, 66, kind, flavorId, menu));
      const name = sideItem(menu, kind, flavorId)?.name ?? flavorId;
      const packed = ticket.sidePacks?.[kind] ? ' ✓' : '';
      if (details) {
        text(left + PAD + 80, rowY - 40, `${count} × ${name}${packed}`, 32, true);
        text(left + PAD + 80, rowY + 44, sideRecipeLine(kind, flavorId, menu), 25, false, 0, '#6b5d52');
      } else text(left + PAD + 80, rowY, `${count} × ${name}${packed}`, 30);
    });

    text(left + PAD, top + h - FOOTER / 2 - 4 - (sideGroups.length ? 40 : 0), `box: ${box?.name ?? ticket.order.boxId}`, 32);
    if (sideGroups.length) {
      const kinds = SIDE_KINDS.filter((k) => sidesOf(ticket.order, k).length);
      const names = kinds.map((k) => (k === 'kolache' ? 'kolache box' : 'onigiri pack') + (ticket.sidePacks?.[k] ? ' ✓' : '')).join(' · ');
      text(left + PAD, top + h - FOOTER / 2 - 4, `+ ${names}`, 28, false, 0, '#6b5d52');
    }
    scene.add.existing(this);
  }
}
