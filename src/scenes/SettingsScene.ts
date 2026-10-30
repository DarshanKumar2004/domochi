import Phaser from 'phaser';
import { save } from '../systems/services';
import { Button } from '../ui/Button';
import { addCard, beginOverlay } from '../ui/overlay';
import { COLORS, CSS, FONT_FAMILY } from '../ui/theme';
import { onLayout } from '../ui/viewport';
import { stopMainGame } from './flow';
import { SceneKeys } from './sceneKeys';

export class SettingsScene extends Phaser.Scene {
  private confirmingReset = false;

  constructor() {
    super(SceneKeys.Settings);
  }

  create(): void {
    this.confirmingReset = false;
    beginOverlay(this);
    // One container centred on screen; children are laid out relative to the card centre.
    const card = this.add.container(0, 0, [addCard(this, 860, 820)]);

    card.add(
      this.add
        .text(0, -310, 'Settings', { fontFamily: FONT_FAMILY, fontSize: '80px', fontStyle: 'bold', color: CSS.ink })
        .setOrigin(0.5),
    );
    card.add(
      new Button(this, 0, -140, 'Replay tutorial', () => this.replayTutorial(), {
        width: 640,
        name: 'btn-replay-tutorial',
      }),
    );

    const reset = new Button(
      this,
      0,
      40,
      'Reset progress',
      () => {
        // Two taps, so progress isn't wiped by accident.
        if (!this.confirmingReset) {
          this.confirmingReset = true;
          reset.setLabel('Tap again to reset');
          return;
        }
        void save()
          .reset()
          .then(() => this.replayTutorial());
      },
      { width: 640, fill: COLORS.danger, name: 'btn-reset' },
    );
    card.add(reset);

    card.add(
      new Button(this, 0, 260, 'Close', () => this.scene.stop(), {
        width: 400,
        fill: COLORS.dough,
        name: 'btn-close-settings',
      }),
    );

    onLayout(this, (v) => card.setPosition(v.width / 2, v.height / 2));
  }

  private replayTutorial(): void {
    stopMainGame(this);
    this.scene.start(SceneKeys.Tutorial);
  }
}
