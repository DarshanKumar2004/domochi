import Phaser from 'phaser';
import { menu, session } from '../systems/services';
import { beginOverlay } from '../ui/overlay';
import { CSS, FONT_FAMILY } from '../ui/theme';
import { TicketCard } from '../ui/TicketCard';
import { onLayout } from '../ui/viewport';
import { SceneKeys } from './sceneKeys';

/** A ticket shown big, with each donut's recipe. Opened by tapping the selected rail ticket (or double-tapping any); tap anywhere to close. */
export class TicketViewScene extends Phaser.Scene {
  private ticketNo = 0;

  constructor() {
    super(SceneKeys.TicketView);
  }

  init(data: { ticketNo: number }): void {
    this.ticketNo = data.ticketNo;
  }

  create(): void {
    const ticket = session().ticket(this.ticketNo);
    if (!ticket) {
      this.scene.stop();
      return;
    }
    const blocker = beginOverlay(this, 0.6);
    // Close on a fresh tap only. The finger that double-tapped to open this is
    // still down; without this, lifting it would close the view straight away.
    // And not in the first moment: the second tap of a double-tap shouldn't close it either.
    let armed = false;
    const openedAt = this.time.now;
    blocker.on(Phaser.Input.Events.POINTER_DOWN, () => (armed = this.time.now - openedAt > 450));
    blocker.on(Phaser.Input.Events.POINTER_UP, () => {
      if (armed) this.scene.stop();
    });
    const card = new TicketCard(this, 0, 0, ticket, menu, true).setName('ticket-view');
    const hint = this.add
      .text(0, 0, 'tap anywhere to close', { fontFamily: FONT_FAMILY, fontSize: '40px', color: CSS.cream })
      .setOrigin(0.5);

    onLayout(this, (v) => {
      // As big as fits, leaving room for the hint.
      const scale = Math.min(1.6, (v.width - 80) / 540, (v.height - 260) / card.cardHeight);
      card.setScale(scale).setPosition(v.width / 2, v.height / 2 - 30);
      hint.setPosition(v.width / 2, v.height / 2 + (card.cardHeight * scale) / 2 + 40);
    });
  }
}
