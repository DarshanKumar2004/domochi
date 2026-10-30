import Phaser from 'phaser';
import type { GameSession, Ticket } from '../systems/GameSession';
import type { Menu } from '../systems/menu';
import { addDonutIcon } from './DonutIcon';
import type { Viewport } from './layout';
import { COLORS, CSS, FONT_FAMILY } from './theme';

const TICKET_W = 150;
const GAP = 14;
const LEFT_PAD = 24;
/** Room kept on the right for the Settings button (HudScene places it). */
export const RAIL_RIGHT_RESERVE = 280;

/**
 * Papa's-style ticket rail across the top: Day on the left, then a mini
 * ticket per open order. Tap a ticket to make it the one the stations work on.
 */
export class TicketRail extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly dayText: Phaser.GameObjects.Text;
  private readonly tickets: Phaser.GameObjects.Container;
  private viewport: Viewport | null = null;

  constructor(
    scene: Phaser.Scene,
    private readonly menu: Menu,
    private readonly onSelect: (ticketNo: number) => void,
  ) {
    super(scene, 0, 0);
    this.bg = scene.make.graphics({}, false);
    this.dayText = scene.make
      .text({ text: '', style: { fontFamily: FONT_FAMILY, fontSize: '44px', fontStyle: 'bold', color: CSS.cream } }, false)
      .setOrigin(0, 0.5);
    this.tickets = scene.make.container({}, false);
    this.add([this.bg, this.dayText, this.tickets]);
    scene.add.existing(this);
  }

  layout(v: Viewport, session: GameSession): void {
    this.viewport = v;
    const h = v.railHeight;
    this.bg.clear();
    this.bg.fillStyle(COLORS.tabBar);
    this.bg.fillRect(0, 0, v.width, h);
    this.bg.fillStyle(COLORS.pink);
    this.bg.fillRect(0, h - 6, v.width, 6);
    this.dayText.setPosition(LEFT_PAD, h / 2);
    this.refresh(session);
  }

  refresh(session: GameSession): void {
    const v = this.viewport;
    if (!v) return;
    this.dayText.setText(`Day ${session.day}\n${session.servedCount}/${session.customersToday}`);
    this.dayText.setLineSpacing(-6).setFontSize(v.orientation === 'landscape' ? 36 : 42);

    this.tickets.removeAll(true);
    const h = v.railHeight - 30;
    const startX = LEFT_PAD + 170;
    const room = v.width - startX - RAIL_RIGHT_RESERVE;
    const fit = Math.max(1, Math.floor((room + GAP) / (TICKET_W + GAP)));
    const open = session.openTickets;
    const shown = open.length > fit ? open.slice(0, fit - 1) : open;

    shown.forEach((t, i) => {
      this.tickets.add(this.miniTicket(t, startX + i * (TICKET_W + GAP), 10, h, session.activeTicket?.no === t.no));
    });
    if (shown.length < open.length) {
      const x = startX + shown.length * (TICKET_W + GAP) + TICKET_W / 2;
      this.tickets.add(
        this.scene.make
          .text({ x, y: 10 + h / 2, text: `+${open.length - shown.length}`, style: { fontFamily: FONT_FAMILY, fontSize: '48px', fontStyle: 'bold', color: CSS.cream } }, false)
          .setOrigin(0.5),
      );
    }
  }

  private miniTicket(t: Ticket, x: number, y: number, h: number, active: boolean): Phaser.GameObjects.Container {
    const c = this.scene.make.container({ x, y }, false);
    const g = this.scene.make.graphics({}, false);
    const held = t.status === 'boxed';
    g.fillStyle(held ? 0xd8d2c6 : COLORS.card);
    g.fillRoundedRect(0, active ? -6 : 0, TICKET_W, h, 14);
    g.lineStyle(active ? 8 : 3, active ? COLORS.pink : COLORS.ink);
    g.strokeRoundedRect(0, active ? -6 : 0, TICKET_W, h, 14);
    c.add(g);

    const label = this.scene.make
      .text({ x: 14, y: 26 + (active ? -6 : 0), text: `#${t.no}`, style: { fontFamily: FONT_FAMILY, fontSize: '34px', fontStyle: 'bold', color: CSS.ink } }, false)
      .setOrigin(0, 0.5);
    c.add(label);
    if (held) {
      c.add(
        this.scene.make
          .text({ x: TICKET_W - 12, y: 26, text: 'in hand', style: { fontFamily: FONT_FAMILY, fontSize: '22px', color: CSS.ink } }, false)
          .setOrigin(1, 0.5),
      );
    }

    // Up to 6 mini donuts, 3 per row.
    const size = Math.min(42, (h - 50) / 2);
    t.order.flavors.slice(0, 6).forEach((f, i) => {
      const ix = 28 + (i % 3) * 47;
      const iy = 50 + size / 2 + Math.floor(i / 3) * (size + 2) + (active ? -6 : 0);
      c.add(addDonutIcon(this.scene, ix, iy, size, f, this.menu));
    });

    const hit = new Phaser.GameObjects.Zone(this.scene, 0, 0, TICKET_W, h)
      .setOrigin(0)
      .setName(`ticket-${t.no}`)
      .setInteractive({ useHandCursor: true });
    hit.on(Phaser.Input.Events.POINTER_DOWN, () => this.onSelect(t.no));
    c.add(hit);
    return c;
  }
}
