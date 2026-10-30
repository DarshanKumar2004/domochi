import Phaser from 'phaser';
import type { Viewport } from '../ui/layout';
import { CSS, FONT_FAMILY } from '../ui/theme';
import { onLayout } from '../ui/viewport';
import type { SceneKey } from './sceneKeys';

/** Shared header and background for the kitchen stations. */
export abstract class StationScene extends Phaser.Scene {
  private subtitleText!: Phaser.GameObjects.Text;

  /**
   * @param fullPhase For placeholder stations: the phase that builds them, shown
   *   as the subtitle. Null for finished stations, which set their own subtitle.
   */
  constructor(
    key: SceneKey,
    private readonly title: string,
    private readonly bgColor: number,
    private readonly fullPhase: number | null,
  ) {
    super(key);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(this.bgColor);
    const title = this.add
      .text(0, 0, this.title, { fontFamily: FONT_FAMILY, fontSize: '84px', fontStyle: 'bold', color: CSS.cream })
      .setOrigin(0.5);
    this.subtitleText = this.add
      .text(0, 0, this.fullPhase === null ? '' : `Placeholder · full station in Phase ${this.fullPhase}`, {
        fontFamily: FONT_FAMILY,
        fontSize: '40px',
        color: CSS.muted,
      })
      .setOrigin(0.5)
      .setName('station-subtitle');
    this.buildStation();

    onLayout(this, (v) => {
      const h = this.headerPosition(v);
      title.setPosition(h.x, h.titleY);
      this.subtitleText.setPosition(h.x, h.subtitleY);
      this.layoutStation(v);
    });
  }

  protected setSubtitle(text: string): void {
    if (this.subtitleText.text !== text) this.subtitleText.setText(text);
  }

  /** Where the title and subtitle go. Override to move them out of the way. */
  protected headerPosition(v: Viewport): { x: number; titleY: number; subtitleY: number } {
    const L = v.orientation === 'landscape';
    return { x: v.width / 2, titleY: v.content.y + (L ? 55 : 80), subtitleY: v.content.y + (L ? 120 : 160) };
  }

  /** Create the station's objects (positions don't matter yet). */
  protected abstract buildStation(): void;

  /** Position the station's objects for the current screen. Called on create and every resize. */
  protected abstract layoutStation(v: Viewport): void;
}
