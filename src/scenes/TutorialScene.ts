import Phaser from 'phaser';
import { AnimKeys, TextureKeys } from '../assets/keys';
import tutorial from '../data/tutorial.json';
import { save } from '../systems/services';
import { Button } from '../ui/Button';
import type { Viewport } from '../ui/layout';
import { addTapArea } from '../ui/overlay';
import { SpeechBubble } from '../ui/SpeechBubble';
import { COLORS, CSS, FONT_FAMILY } from '../ui/theme';
import { onLayout } from '../ui/viewport';
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
    const tapArea = addTapArea(this);

    const ethan = this.add.sprite(0, 0, TextureKeys.Ethan).setOrigin(0.5, 1).setScale(2).play(AnimKeys.EthanWave);
    // Counter in front of Ethan (his sprite is torso-up).
    const counter = this.add.rectangle(0, 0, 1, 60, COLORS.brown).setOrigin(0);
    const counterTrim = this.add.rectangle(0, 0, 1, 30, COLORS.pinkDark).setOrigin(0);

    const bubble = new SpeechBubble(this, 0, 0, 860, lines[0] ?? '', -240);
    const hint = this.add
      .text(0, 0, 'tap to continue', { fontFamily: FONT_FAMILY, fontSize: '40px', color: CSS.muted })
      .setOrigin(0.5);

    const done = new Button(this, 0, 0, "Let's go!", () => this.finish(), { name: 'btn-tutorial-done' });
    done.setVisible(false);

    const skip = new Button(this, 0, 0, 'Skip', () => this.finish(), {
      width: 260,
      height: 120,
      fontSize: 44,
      name: 'btn-skip',
    });

    onLayout(this, (v: Viewport) => {
      const s = v.safe;
      const L = v.orientation === 'landscape';
      const counterY = s.y + (L ? 880 : 1490);
      ethan.setPosition(s.x + (L ? 420 : 300), counterY + 10);
      counter.setPosition(0, counterY).setSize(v.width, 60);
      counterTrim.setPosition(0, counterY + 60).setSize(v.width, 30);
      bubble.setPosition(s.x + (L ? 1260 : 600), s.y + (L ? 360 : 720));
      hint.setPosition(s.x + (L ? 1260 : 600), s.y + (L ? 620 : 1000));
      done.setPosition(L ? s.x + 1260 : v.width / 2, s.y + (L ? 660 : 1700));
      skip.setPosition(v.width - 170, 110);
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
