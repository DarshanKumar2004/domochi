import Phaser from 'phaser';
import { AnimKeys, TextureKeys } from '../assets/keys';
import tutorial from '../data/tutorial.json';
import { save } from '../systems/services';
import { Button } from '../ui/Button';
import { GAME_HEIGHT, GAME_WIDTH } from '../ui/layout';
import { SpeechBubble } from '../ui/SpeechBubble';
import { COLORS, CSS, FONT_FAMILY } from '../ui/theme';
import { startMainGame } from './flow';
import { SceneKeys } from './sceneKeys';

/**
 * Phase 1 placeholder: Ethan says hello, then the player enters the Lobby.
 * The guided, step-by-step tutorial comes in Phase 7.
 */
export class TutorialScene extends Phaser.Scene {
  private lineIndex = 0;
  private finished = false;

  constructor() {
    super(SceneKeys.Tutorial);
  }

  create(): void {
    this.lineIndex = 0;
    this.finished = false;
    this.cameras.main.setBackgroundColor(COLORS.bg);
    const lines = tutorial.intro;

    // Tap anywhere to advance Ethan's lines.
    const tapArea = this.add.zone(0, 0, GAME_WIDTH, GAME_HEIGHT).setOrigin(0).setInteractive();

    this.add
      .sprite(300, 1500, TextureKeys.Ethan)
      .setOrigin(0.5, 1)
      .setScale(2)
      .play(AnimKeys.EthanWave);
    // Counter in front of Ethan (his sprite is torso-up).
    this.add.rectangle(0, 1490, GAME_WIDTH, 60, COLORS.brown).setOrigin(0);
    this.add.rectangle(0, 1550, GAME_WIDTH, 30, COLORS.pinkDark).setOrigin(0);

    const bubble = new SpeechBubble(this, 600, 720, 860, lines[0] ?? '', -240);
    const hint = this.add
      .text(600, 1000, 'tap to continue', { fontFamily: FONT_FAMILY, fontSize: '40px', color: CSS.muted })
      .setOrigin(0.5);

    const done = new Button(this, GAME_WIDTH / 2, 1700, "Let's go!", () => this.finish(), { name: 'btn-tutorial-done' });
    done.setVisible(false);

    new Button(this, GAME_WIDTH - 170, 110, 'Skip', () => this.finish(), {
      width: 260,
      height: 120,
      fontSize: 44,
      name: 'btn-skip',
    });

    tapArea.on(Phaser.Input.Events.POINTER_DOWN, () => {
      if (this.lineIndex >= lines.length - 1) return;
      this.lineIndex++;
      bubble.setMessage(lines[this.lineIndex] ?? '');
      if (this.lineIndex === lines.length - 1) {
        hint.setVisible(false);
        done.setVisible(true);
      }
    });
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    void save().update((d) => {
      d.tutorialDone = true;
    });
    startMainGame(this);
  }
}
