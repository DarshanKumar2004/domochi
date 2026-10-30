import Phaser from 'phaser';
import { Button } from '../ui/Button';
import { addCard, beginOverlay } from '../ui/overlay';
import { CSS, FONT_FAMILY } from '../ui/theme';
import { onLayout } from '../ui/viewport';
import { SceneKeys } from './sceneKeys';

const ROWS = ['Fry', 'Glaze', 'Toppings', 'Box', 'Wait time'];
const CARD_W = 860;
const CARD_H = 900; // fits both orientations (landscape height is 1080)

/** Result card shown over the Lobby after serving. Phase 1: no real scores yet. */
export class ServeScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Serve);
  }

  create(): void {
    beginOverlay(this);
    // Everything lives in one container centred on the screen, laid out relative to the card centre.
    const card = this.add.container(0, 0, [addCard(this, CARD_W, CARD_H)]);

    card.add(
      this.add
        .text(0, -360, 'Order served!', { fontFamily: FONT_FAMILY, fontSize: '80px', fontStyle: 'bold', color: CSS.ink })
        .setOrigin(0.5),
    );
    const rowStyle = { fontFamily: FONT_FAMILY, fontSize: '54px', color: CSS.ink };
    ROWS.forEach((label, i) => {
      const y = -230 + i * 95;
      card.add(this.add.text(-340, y, label, rowStyle).setOrigin(0, 0.5));
      card.add(this.add.text(340, y, '—', rowStyle).setOrigin(1, 0.5));
    });
    card.add(
      this.add
        .text(0, 250, 'Tip: —', { fontFamily: FONT_FAMILY, fontSize: '64px', fontStyle: 'bold', color: CSS.pink })
        .setOrigin(0.5),
    );
    card.add(new Button(this, 0, 360, 'Back to lobby', () => this.scene.stop(), { name: 'btn-serve-done' }));

    onLayout(this, (v) => card.setPosition(v.width / 2, v.height / 2));
  }
}
