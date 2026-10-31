import Phaser from 'phaser';
import type { GameSession, Ticket } from '../systems/GameSession';
import type { Menu } from '../systems/menu';
import { addDonutIcon } from './DonutIcon';
import type { Viewport } from './layout';
import { COLORS, CSS, FONT_FAMILY } from './theme';

const TICKET_W = 150;
/** Two taps on the same ticket within this time open the big view (the common double-click time). */
const DOUBLE_TAP_MS = 500;
const GAP = 14;
const LEFT_PAD = 24;
/** Room kept on the right for the Settings button (HudScene places it). */
export const RAIL_RIGHT_RESERVE = 280;

/**
 * Papa's-style ticket rail across the top: Day on the left, then a mini
 * ticket per open order. Tap a ticket to select it (the Box station serves the
 * selected one); double-tap to see it big.
 */
export class TicketRail extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly dayText: Phaser.GameObjects.Text;
  private readonly tickets: Phaser.GameObjects.Container;
  private viewport: Viewport | null = null;
  /** Last tap, to spot double-taps (the ticket objects are rebuilt between taps). */
  private lastTap = { no: -1, at: 0 };
  /** Which tickets are drawn (to rebuild only when that changes, not on every selection). */
  private shownKey = '';
  private readonly frames = new Map<number, { g: Phaser.GameObjects.Graphics; h: number }>();

  constructor(
    scene: Phaser.Scene,
    private readonly menu: Menu,
    private readonly onSelect: (ticketNo: number) => void,
    /** Double-tap: open the big ticket view. */
    private readonly onOpen: (ticketNo: number) => void,
    /** Money so far (banked from earlier days plus today's sales and tips). */
    private readonly money: () => number,
  ) {
    super(scene, 0, 0);
    this.bg = scene.make.graphics({}, false);
    this.dayText = scene.make
      .text({ text: '', style: { fontFamily: FONT_FAMILY, fontSize: '44px', fontStyle: 'bold', color: CSS.cream } }, false)
      .setOrigin(0, 0.5)
      .setName('rail-day');
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
    this.dayText.setText(`Day ${session.day}\n${session.servedCount}/${session.customersToday} served\n$${this.money().toFixed(2)}`);
    this.dayText.setLineSpacing(-8).setFontSize(v.orientation === 'landscape' ? 28 : 34);

    const h = v.railHeight - 30;
    const startX = LEFT_PAD + 170;
    const room = v.width - startX - RAIL_RIGHT_RESERVE;
    const fit = Math.max(1, Math.floor((room + GAP) / (TICKET_W + GAP)));
    const open = session.openTickets;
    const shown = open.length > fit ? open.slice(0, fit - 1) : open;
    const activeNo = session.activeTicket?.no;

    // Selecting a ticket only redraws its frame. Rebuilding would replace the tap
    // targets, and new ones only become tappable a frame later, which can swallow
    // the second tap of a double-tap.
    const key = `${v.width}x${v.railHeight}:${open.map((t) => t.no).join(',')}`;
    if (key === this.shownKey) {
      for (const [no, fr] of this.frames) this.drawFrame(fr.g, fr.h, no === activeNo);
      return;
    }
    this.shownKey = key;
    this.tickets.removeAll(true);
    this.frames.clear();

    shown.forEach((t, i) => {
      this.tickets.add(this.miniTicket(t, startX + i * (TICKET_W + GAP), 10, h, activeNo === t.no));
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
    this.drawFrame(g, h, active);
    this.frames.set(t.no, { g, h });
    c.add(g);

    const label = this.scene.make
      .text({ x: 14, y: 26, text: `#${t.no}`, style: { fontFamily: FONT_FAMILY, fontSize: '34px', fontStyle: 'bold', color: CSS.ink } }, false)
      .setOrigin(0, 0.5);
    c.add(label);
    // Pickup orders are marked "to go".
    if (t.delivery) {
      c.add(
        this.scene.make
          .text({ x: TICKET_W - 10, y: 26, text: 'to go', style: { fontFamily: FONT_FAMILY, fontSize: '22px', fontStyle: 'bold', color: CSS.cream, backgroundColor: '#b0406a', padding: { x: 6, y: 2 } } }, false)
          .setOrigin(1, 0.5),
      );
    }
    // Up to 6 mini donuts, 3 per row.
    const size = Math.min(42, (h - 50) / 2);
    t.order.flavors.slice(0, 6).forEach((f, i) => {
      const ix = 28 + (i % 3) * 47;
      const iy = 50 + size / 2 + Math.floor(i / 3) * (size + 2);
      c.add(addDonutIcon(this.scene, ix, iy, size, f, this.menu));
    });

    const hit = new Phaser.GameObjects.Zone(this.scene, 0, 0, TICKET_W, h)
      .setOrigin(0)
      .setName(`ticket-${t.no}`)
      .setInteractive({ useHandCursor: true });
    hit.on(Phaser.Input.Events.POINTER_DOWN, () => {
      const now = performance.now();
      const double = this.lastTap.no === t.no && now - this.lastTap.at < DOUBLE_TAP_MS;
      this.lastTap = double ? { no: -1, at: 0 } : { no: t.no, at: now };
      if (double) this.onOpen(t.no);
      else this.onSelect(t.no);
    });
    c.add(hit);
    return c;
  }

  /** Ticket card background; the selected one gets a thick pink frame. */
  private drawFrame(g: Phaser.GameObjects.Graphics, h: number, active: boolean): void {
    g.clear();
    g.fillStyle(COLORS.card);
    g.fillRoundedRect(0, 0, TICKET_W, h, 14);
    g.lineStyle(active ? 8 : 3, active ? COLORS.pink : COLORS.ink);
    g.strokeRoundedRect(0, 0, TICKET_W, h, 14);
  }
}
