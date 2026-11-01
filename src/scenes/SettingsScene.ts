import Phaser from 'phaser';
import { applyOrientation, isNative, type OrientationChoice } from '../systems/native';
import { audio, save, saveDayInProgress } from '../systems/services';
import { Button } from '../ui/Button';
import { Slider } from '../ui/Slider';
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
    // In the Android app there's one more row: how the screen turns.
    const app = isNative();
    const cardH = app ? CARD_H + 140 : CARD_H;
    // One container centred on screen; children are laid out relative to the card centre.
    const card = this.add.container(0, 0, [addCard(this, 860, cardH)]);
    let y = -cardH / 2 + 90;
    card.add(this.add.text(0, y, 'Settings', { fontFamily: FONT_FAMILY, fontSize: '80px', fontStyle: 'bold', color: CSS.ink }).setOrigin(0.5));

    // Music and sound volume (saved when you let go; applied as you slide).
    const a = audio();
    const keep = () =>
      void save().update((d) => {
        d.settings.music = a.musicOn;
        d.settings.sound = a.soundOn;
        d.settings.musicVolume = a.musicVolume;
        d.settings.soundVolume = a.soundVolume;
      });
    y += 150;
    card.add(new Slider(this, 'Music', a.musicVolume, (v) => a.setMusicVolume(v), keep, 'slider-music').setPosition(60, y));
    y += 110;
    card.add(new Slider(this, 'Sound', a.soundVolume, (v) => a.setSoundVolume(v), () => (keep(), a.play('ding')), 'slider-sound').setPosition(60, y));
    y += 150;

    if (app) {
      const names: Record<OrientationChoice, string> = { landscape: 'Screen: landscape', portrait: 'Screen: portrait', auto: 'Screen: auto-rotate' };
      const order: OrientationChoice[] = ['landscape', 'portrait', 'auto'];
      const screen = new Button(this, 0, y, names[save().data.settings.orientation ?? 'landscape'], () => {
        const now = save().data.settings.orientation ?? 'landscape';
        const next = order[(order.indexOf(now) + 1) % order.length]!;
        screen.setLabel(names[next]);
        void save().update((d) => void (d.settings.orientation = next));
        void applyOrientation(next);
      }, { width: 640, fill: COLORS.dough, name: 'btn-orientation', fontSize: 44 });
      card.add(screen);
      y += 150;
    }

    card.add(new Button(this, 0, y, 'Replay tutorial', () => this.replayTutorial(), { width: 640, name: 'btn-replay-tutorial' }));
    y += 150;
    const reset = new Button(
      this,
      0,
      y,
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
    y += 150;
    // Back to the home screen (about us, notes for Ethan); the day so far is saved.
    card.add(new Button(this, 0, y, 'Home screen', () => this.goHome(), { width: 640, fill: COLORS.dough, name: 'btn-home' }));
    y += 165;
    card.add(new Button(this, 0, y, 'Close', () => this.scene.stop(), { width: 400, fill: COLORS.dough, name: 'btn-close-settings' }));

    onLayout(this, (v) => card.setPosition(v.width / 2, v.height / 2).setScale(Math.min(1, (v.height - 40) / cardH)));
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
