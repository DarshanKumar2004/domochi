import Phaser from 'phaser';
import { Button } from '../ui/Button';
import { GAME_WIDTH } from '../ui/layout';
import { addCard, beginOverlay } from '../ui/overlay';
import { CSS, FONT_FAMILY } from '../ui/theme';
import { SceneKeys } from './sceneKeys';

const ROWS = ['Fry', 'Glaze', 'Toppings', 'Box', 'Wait time'];

/** Result card shown over the Lobby after serving. Phase 1: no real scores yet. */
export class ServeScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Serve);
  }

  create(): void {
    beginOverlay(this);
    const cx = GAME_WIDTH / 2;
    addCard(this, cx, 860, 860, 1100);

    this.add
      .text(cx, 400, 'Order served!', { fontFamily: FONT_FAMILY, fontSize: '80px', fontStyle: 'bold', color: CSS.ink })
      .setOrigin(0.5);

    const rowStyle = { fontFamily: FONT_FAMILY, fontSize: '54px', color: CSS.ink };
    ROWS.forEach((label, i) => {
      const y = 560 + i * 110;
      this.add.text(200, y, label, rowStyle).setOrigin(0, 0.5);
      this.add.text(880, y, '—', rowStyle).setOrigin(1, 0.5);
    });
    this.add
      .text(cx, 1160, 'Tip: —', { fontFamily: FONT_FAMILY, fontSize: '64px', fontStyle: 'bold', color: CSS.pink })
      .setOrigin(0.5);

    new Button(this, cx, 1310, 'Back to lobby', () => this.scene.stop(), { name: 'btn-serve-done' });
  }
}
