import Phaser from 'phaser';
import { TextureKeys } from '../assets/keys';
import { Button } from '../ui/Button';
import { GAME_WIDTH } from '../ui/layout';
import { beginOverlay } from '../ui/overlay';
import { SpeechBubble } from '../ui/SpeechBubble';
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
    this.add.image(300, 1400, TextureKeys.Customer).setOrigin(0.5, 1).setScale(1.8);
    new SpeechBubble(
      this,
      640,
      560,
      780,
      'Hi! Could I get one mochi donut, please?',
      -220,
    );
    new Button(this, GAME_WIDTH / 2, 1560, 'Take order', () => this.scene.stop(), { name: 'btn-take-order' });
  }
}
