import Phaser from 'phaser';
import { TextureKeys } from '../assets/keys';
import { Button } from '../ui/Button';
import type { Viewport } from '../ui/layout';
import { beginOverlay } from '../ui/overlay';
import { SpeechBubble } from '../ui/SpeechBubble';
import { onLayout } from '../ui/viewport';
import { SceneKeys } from './sceneKeys';

/**
 * Popup over the Lobby where the front customer says their order.
 * Phase 1: fixed placeholder line. Phase 2 generates orders from menu.json and makes a ticket.
 */
export class OrderScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Order);
  }

  create(): void {
    beginOverlay(this);
    const customer = this.add.image(0, 0, TextureKeys.Customer).setOrigin(0.5, 1);
    const bubble = new SpeechBubble(this, 0, 0, 780, 'Hi! Could I get one mochi donut, please?', -220);
    const take = new Button(this, 0, 0, 'Take order', () => this.scene.stop(), { name: 'btn-take-order' });

    onLayout(this, (v: Viewport) => {
      const c = v.content;
      if (v.orientation === 'landscape') {
        customer.setPosition(c.x + 450, c.y + 900).setScale(1.6);
        bubble.setPosition(c.x + 1150, c.y + 300);
        take.setPosition(c.x + 1150, c.y + 700);
      } else {
        customer.setPosition(c.x + 300, c.y + 1400).setScale(1.8);
        bubble.setPosition(c.x + 640, c.y + 560);
        take.setPosition(c.x + 540, c.y + 1560);
      }
    });
  }
}
