import Phaser from 'phaser';
import type { Viewport } from '../ui/layout';
import { CSS, FONT_FAMILY } from '../ui/theme';
import { onLayout } from '../ui/viewport';
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
    const title = this.add
      .text(0, 0, this.title, { fontFamily: FONT_FAMILY, fontSize: '84px', fontStyle: 'bold', color: CSS.cream })
      .setOrigin(0.5);
    const subtitle = this.add
      .text(0, 0, `Placeholder · full station in Phase ${this.fullPhase}`, {
        fontFamily: FONT_FAMILY,
        fontSize: '40px',
        color: CSS.muted,
      })
      .setOrigin(0.5);
    this.buildStation();

    onLayout(this, (v) => {
      const L = v.orientation === 'landscape';
      title.setPosition(v.width / 2, v.content.y + (L ? 80 : 110));
      subtitle.setPosition(v.width / 2, v.content.y + (L ? 160 : 200));
      this.layoutStation(v);
    });
  }

  /** Create the station's objects (positions don't matter yet). */
  protected abstract buildStation(): void;

  /** Position the station's objects for the current screen. Called on create and every resize. */
  protected abstract layoutStation(v: Viewport): void;
}
