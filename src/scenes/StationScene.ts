import Phaser from 'phaser';
import { GAME_WIDTH } from '../ui/layout';
import { CSS, FONT_FAMILY } from '../ui/theme';
import type { SceneKey } from './sceneKeys';

/** Shared header and background for the kitchen stations. */
export abstract class StationScene extends Phaser.Scene {
  constructor(
    key: SceneKey,
    private readonly title: string,
    private readonly bgColor: number,
    private readonly fullPhase: number,
  ) {
    super(key);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(this.bgColor);
    this.add
      .text(GAME_WIDTH / 2, 110, this.title, {
        fontFamily: FONT_FAMILY,
        fontSize: '84px',
        fontStyle: 'bold',
        color: CSS.cream,
      })
      .setOrigin(0.5);
    this.add
      .text(GAME_WIDTH / 2, 200, `Placeholder · full station in Phase ${this.fullPhase}`, {
        fontFamily: FONT_FAMILY,
        fontSize: '40px',
        color: CSS.muted,
      })
      .setOrigin(0.5);
    this.buildStation();
  }

  protected abstract buildStation(): void;
}
