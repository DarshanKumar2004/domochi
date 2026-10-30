import Phaser from 'phaser';
import { COLORS, CSS, FONT_FAMILY } from './theme';

const PADDING = 44;
const TAIL = 50;

/**
 * Speech bubble centred on (x, y), with a tail on the bottom edge.
 * `tailX` moves the tail left/right from the bubble's centre.
 */
export class SpeechBubble extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly text: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly bubbleWidth: number,
    text: string,
    private readonly tailX = 0,
    fontSize = 52,
  ) {
    super(scene, x, y);
    this.bg = scene.make.graphics({}, false);
    this.text = scene.make
      .text(
        {
          text,
          style: {
            fontFamily: FONT_FAMILY,
            fontSize: `${fontSize}px`,
            color: CSS.ink,
            align: 'center',
            wordWrap: { width: bubbleWidth - PADDING * 2 },
            lineSpacing: 10,
          },
        },
        false,
      )
      .setOrigin(0.5);
    this.add([this.bg, this.text]);
    this.redraw();
    scene.add.existing(this);
  }

  setMessage(text: string): this {
    this.text.setText(text);
    this.redraw();
    return this;
  }

  private redraw(): void {
    const w = this.bubbleWidth;
    const h = this.text.height + PADDING * 2;
    const g = this.bg;
    g.clear();
    g.fillStyle(0x000000, 0.2);
    g.fillRoundedRect(-w / 2, -h / 2 + 10, w, h, 40);
    g.fillStyle(COLORS.card);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 40);
    g.fillTriangle(this.tailX - 30, h / 2 - 2, this.tailX + 30, h / 2 - 2, this.tailX - 10, h / 2 + TAIL);
  }
}
