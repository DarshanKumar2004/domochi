import Phaser from 'phaser';
import { menu, session } from '../systems/services';
import { Button } from '../ui/Button';
import type { Viewport } from '../ui/layout';
import { beginOverlay } from '../ui/overlay';
import { SpeechBubble } from '../ui/SpeechBubble';
import { TicketCard } from '../ui/TicketCard';
import { onLayout } from '../ui/viewport';
import { customerLook } from '../ui/customerLook';
import { SceneKeys } from './sceneKeys';

/** Popup over the Lobby: the front customer says their order and the ticket is written. */
export class OrderScene extends Phaser.Scene {
  private ticketNo = 0;

  constructor() {
    super(SceneKeys.Order);
  }

  init(data: { ticketNo: number }): void {
    this.ticketNo = data.ticketNo;
  }

  create(): void {
    const s = session();
    const ticket = s.ticket(this.ticketNo);
    const cust = ticket ? s.customer(ticket.customerId) : undefined;
    if (!ticket || !cust) {
      this.scene.stop();
      return;
    }

    beginOverlay(this);
    const customer = this.add.image(0, 0, customerLook(s, cust)).setOrigin(0.5, 1);
    const bubble = new SpeechBubble(this, 0, 0, 760, ticket.line, -220, 48);
    const card = new TicketCard(this, 0, 0, ticket, menu);
    const gotIt = new Button(
      this,
      0,
      0,
      'Got it!',
      () => {
        s.finishOrdering(cust.id);
        this.scene.stop();
      },
      { name: 'btn-take-order' },
    );

    onLayout(this, (v: Viewport) => {
      const c = v.content;
      if (v.orientation === 'landscape') {
        customer.setPosition(c.x + 330, c.y + 760).setScale(1.5);
        bubble.setPosition(c.x + 900, c.y + 170);
        card.setPosition(c.x + 1590, c.y + 380);
        gotIt.setPosition(c.x + 900, c.y + 660);
      } else {
        customer.setPosition(c.x + 250, c.y + 1150).setScale(1.6);
        bubble.setPosition(c.x + 600, c.y + 260);
        card.setPosition(c.x + 720, c.y + 760);
        gotIt.setPosition(c.x + 540, c.y + 1400);
      }
    });
  }
}
