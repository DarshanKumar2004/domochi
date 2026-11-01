import Phaser from 'phaser';
import { FONT_FAMILY } from './theme';

/**
 * A short label on a soft, rounded background (name tags, "Tap me!"): a text
 * with a pill drawn behind it, redrawn whenever the text or colour changes.
 */
export class Pill extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.Graphics;
  readonly label: Phaser.GameObjects.Text;
  private fill: number;

  constructor(
    scene: Phaser.Scene,
    text: string,
    opts: { fontSize: number; color: string; fill: number; bold?: boolean; padX?: number; padY?: number },
  ) {
    super(scene, 0, 0);
    this.fill = opts.fill;
    this.bg = scene.add.graphics();
    this.label = scene.add
      .text(0, 0, text, { fontFamily: FONT_FAMILY, fontSize: `${opts.fontSize}px`, fontStyle: opts.bold ? 'bold' : 'normal', color: opts.color, align: 'center' })
      .setOrigin(0.5);
    this.padX = opts.padX ?? 16;
    this.padY = opts.padY ?? 6;
    this.add([this.bg, this.label]);
    scene.add.existing(this);
    this.redraw();
  }

  private readonly padX: number;
  private readonly padY: number;

  setText(text: string): this {
    if (text !== this.label.text) {
      this.label.setText(text);
      this.redraw();
    }
    return this;
  }

  setFill(color: number): this {
    if (color !== this.fill) {
      this.fill = color;
      this.redraw();
    }
    return this;
  }

  private redraw(): void {
    const w = this.label.width + this.padX * 2;
    const h = this.label.height + this.padY * 2;
    this.bg.clear();
    this.bg.fillStyle(this.fill, 1);
    this.bg.fillRoundedRect(-w / 2, -h / 2, w, h, Math.min(h / 2, 22));
    this.setSize(w, h);
  }
}
