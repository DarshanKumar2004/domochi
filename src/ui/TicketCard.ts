import Phaser from 'phaser';
import type { Ticket } from '../systems/GameSession';
import type { Menu } from '../systems/menu';
import { groupFlavors } from '../systems/orders';
import { addDonutIcon } from './DonutIcon';
import { COLORS, CSS, FONT_FAMILY } from './theme';

const WIDTH = 540;
const PAD = 26;
const ROW = 74;
const HEADER = 84;
const FOOTER = 60;

/** Full order ticket: number, each flavor with a donut icon, and the box. Centred on (x, y). */
export class TicketCard extends Phaser.GameObjects.Container {
  readonly cardHeight: number;

  constructor(scene: Phaser.Scene, x: number, y: number, ticket: Ticket, menu: Menu) {
    super(scene, x, y);
    const groups = groupFlavors(ticket.order.flavors);
    const h = HEADER + groups.length * ROW + FOOTER;
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

    const text = (tx: number, ty: number, s: string, size: number, bold = false, originX = 0) =>
      this.add(
        scene.make
          .text(
            { x: tx, y: ty, text: s, style: { fontFamily: FONT_FAMILY, fontSize: `${size}px`, fontStyle: bold ? 'bold' : 'normal', color: CSS.ink } },
            false,
          )
          .setOrigin(originX, 0.5),
      );

    const box = menu.boxes.find((b) => b.id === ticket.order.boxId);
    text(left + PAD, top + HEADER / 2 - 6, `#${ticket.no}`, 52, true);
    text(-left - PAD, top + HEADER / 2 - 6, `${ticket.order.flavors.length} donut${ticket.order.flavors.length === 1 ? '' : 's'}`, 34, false, 1);

    groups.forEach(({ flavorId, count }, i) => {
      const rowY = top + HEADER + ROW * i + ROW / 2;
      this.add(addDonutIcon(scene, left + PAD + 30, rowY, 64, flavorId, menu));
      const name = menu.flavors.find((f) => f.id === flavorId)?.name ?? flavorId;
      text(left + PAD + 80, rowY, `${count} × ${name}`, 38);
    });

    text(left + PAD, top + h - FOOTER / 2 - 4, `box: ${box?.name ?? ticket.order.boxId}`, 32);
    scene.add.existing(this);
  }
}
