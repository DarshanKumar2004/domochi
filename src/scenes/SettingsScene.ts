import Phaser from 'phaser';
import { audio, save } from '../systems/services';
import { Button } from '../ui/Button';
import { addCard, beginOverlay } from '../ui/overlay';
import { COLORS, CSS, FONT_FAMILY } from '../ui/theme';
import { onLayout } from '../ui/viewport';
import { startMainGame, stopMainGame } from './flow';
import { SceneKeys } from './sceneKeys';

const CARD_H = 960;

export class SettingsScene extends Phaser.Scene {
  private confirmingReset = false;

  constructor() {
    super(SceneKeys.Settings);
  }

  create(): void {
    this.confirmingReset = false;
    beginOverlay(this);
    // One container centred on screen; children are laid out relative to the card centre.
    const card = this.add.container(0, 0, [addCard(this, 860, CARD_H)]);

    card.add(
      this.add
        .text(0, -400, 'Settings', { fontFamily: FONT_FAMILY, fontSize: '80px', fontStyle: 'bold', color: CSS.ink })
        .setOrigin(0.5),
    );
    // Sound and music switches (saved, and applied straight away).
    const a = audio();
    const toggle = (x: number, label: string, get: () => boolean, set: (on: boolean) => void, name: string) => {
      const b = new Button(this, x, -235, `${label}: ${get() ? 'on' : 'off'}`, () => {
        set(!get());
        b.setLabel(`${label}: ${get() ? 'on' : 'off'}`);
        void save().update((d) => {
          d.settings.sound = a.soundOn;
          d.settings.music = a.musicOn;
        });
      }, { width: 340, fill: COLORS.dough, name, fontSize: 48 });
      card.add(b);
    };
    toggle(-185, 'Sound', () => a.soundOn, (on) => a.setSound(on), 'btn-sound');
    toggle(185, 'Music', () => a.musicOn, (on) => a.setMusic(on), 'btn-music');

    card.add(
      new Button(this, 0, -70, 'Replay tutorial', () => this.replayTutorial(), {
        width: 640,
        name: 'btn-replay-tutorial',
      }),
    );

    const reset = new Button(
      this,
      0,
      100,
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
      new Button(this, 0, 340, 'Close', () => this.scene.stop(), {
        width: 400,
        fill: COLORS.dough,
        name: 'btn-close-settings',
      }),
    );

    onLayout(this, (v) => card.setPosition(v.width / 2, v.height / 2).setScale(Math.min(1, (v.height - 40) / CARD_H)));
  }

  private replayTutorial(): void {
    stopMainGame(this);
    startMainGame(this, { tutorial: true });
  }
}
