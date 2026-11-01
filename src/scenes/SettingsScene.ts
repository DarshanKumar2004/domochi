import Phaser from 'phaser';
import { applyOrientation, isNative, type OrientationChoice } from '../systems/native';
import { audio, save, saveDayInProgress } from '../systems/services';
import { Button } from '../ui/Button';
import { addCard, beginOverlay } from '../ui/overlay';
import { COLORS, CSS, FONT_FAMILY } from '../ui/theme';
import { onLayout } from '../ui/viewport';
import { startMainGame, stopMainGame } from './flow';
import { SceneKeys } from './sceneKeys';

const CARD_H = 1100;

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
        .text(0, -460, 'Settings', { fontFamily: FONT_FAMILY, fontSize: '80px', fontStyle: 'bold', color: CSS.ink })
        .setOrigin(0.5),
    );
    // Sound and music switches (saved, and applied straight away).
    const a = audio();
    // In the Android app a third switch: how the screen turns.
    const app = isNative();
    const toggle = (x: number, label: string, get: () => boolean, set: (on: boolean) => void, name: string) => {
      const b = new Button(this, x, -235, `${label}: ${get() ? 'on' : 'off'}`, () => {
        set(!get());
        b.setLabel(`${label}: ${get() ? 'on' : 'off'}`);
        void save().update((d) => {
          d.settings.sound = a.soundOn;
          d.settings.music = a.musicOn;
        });
      }, { width: app ? 250 : 340, fill: COLORS.dough, name, fontSize: app ? 40 : 48 });
      card.add(b);
    };
    toggle(app ? -270 : -185, 'Sound', () => a.soundOn, (on) => a.setSound(on), 'btn-sound');
    toggle(app ? 0 : 185, 'Music', () => a.musicOn, (on) => a.setMusic(on), 'btn-music');
    if (app) {
      const names: Record<OrientationChoice, string> = { landscape: 'Landscape', portrait: 'Portrait', auto: 'Auto-rotate' };
      const order: OrientationChoice[] = ['landscape', 'portrait', 'auto'];
      const screen = new Button(this, 270, -235, names[save().data.settings.orientation ?? 'landscape'], () => {
        const now = save().data.settings.orientation ?? 'landscape';
        const next = order[(order.indexOf(now) + 1) % order.length]!;
        screen.setLabel(names[next]);
        void save().update((d) => void (d.settings.orientation = next));
        void applyOrientation(next);
      }, { width: 250, fill: COLORS.dough, name: 'btn-orientation', fontSize: 40 });
      card.add(screen);
    }

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

    // Back to the home screen (about us, notes for Ethan); the day so far is saved.
    card.add(
      new Button(this, 0, 260, 'Home screen', () => this.goHome(), {
        width: 640,
        fill: COLORS.dough,
        name: 'btn-home',
      }),
    );

    card.add(
      new Button(this, 0, 440, 'Close', () => this.scene.stop(), {
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

  private goHome(): void {
    saveDayInProgress();
    stopMainGame(this);
    this.scene.start(SceneKeys.Preload);
  }
}
