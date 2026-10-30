import Phaser from 'phaser';
import { save } from '../systems/services';
import { Button } from '../ui/Button';
import { GAME_WIDTH } from '../ui/layout';
import { addCard, beginOverlay } from '../ui/overlay';
import { COLORS, CSS, FONT_FAMILY } from '../ui/theme';
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
    const cx = GAME_WIDTH / 2;
    addCard(this, cx, 860, 860, 980);

    this.add
      .text(cx, 470, 'Settings', { fontFamily: FONT_FAMILY, fontSize: '80px', fontStyle: 'bold', color: CSS.ink })
      .setOrigin(0.5);

    new Button(this, cx, 680, 'Replay tutorial', () => this.replayTutorial(), {
      width: 640,
      name: 'btn-replay-tutorial',
    });

    const reset = new Button(this, cx, 880, 'Reset progress', () => {
      // Two taps, so progress isn't wiped by accident.
      if (!this.confirmingReset) {
        this.confirmingReset = true;
        reset.setLabel('Tap again to reset');
        return;
      }
      void save()
        .reset()
        .then(() => this.replayTutorial());
    }, { width: 640, fill: COLORS.danger, name: 'btn-reset' });

    new Button(this, cx, 1180, 'Close', () => this.scene.stop(), {
      width: 400,
      fill: COLORS.dough,
      name: 'btn-close-settings',
    });
  }

  private replayTutorial(): void {
    stopMainGame(this);
    this.scene.start(SceneKeys.Tutorial);
  }
}
