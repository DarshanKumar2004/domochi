import Phaser from 'phaser';
import { audio } from '../systems/services';
import { MIN_HIT_SIZE } from './layout';
import { COLORS, CSS, FONT_FAMILY } from './theme';

export interface ButtonOptions {
  width?: number;
  height?: number;
  fontSize?: number;
  fill?: number;
  textColor?: string;
  /** Object name, used by Playwright tests to find and tap the button. */
  name?: string;
}

/** Rounded button that fires on release, only if the press started on it. */
export class Button extends Phaser.GameObjects.Container {
  private readonly label: Phaser.GameObjects.Text;
  private pressed = false;

  constructor(scene: Phaser.Scene, x: number, y: number, text: string, onTap: () => void, opts: ButtonOptions = {}) {
    super(scene, x, y);
    const w = Math.max(opts.width ?? 520, MIN_HIT_SIZE);
    const h = Math.max(opts.height ?? 140, MIN_HIT_SIZE);

    const bg = scene.make.graphics({}, false);
    // A soft shadow, then a darker lip under the face: it looks like it presses in.
    const fill = opts.fill ?? COLORS.pink;
    bg.fillStyle(0x000000, 0.22);
    bg.fillRoundedRect(-w / 2, -h / 2 + 13, w, h, 36);
    bg.fillStyle(Phaser.Display.Color.IntegerToColor(fill).darken(16).color);
    bg.fillRoundedRect(-w / 2, -h / 2 + 8, w, h, 36);
    bg.fillStyle(fill);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 36);

    this.label = scene.make
      .text(
        {
          text,
          style: {
            fontFamily: FONT_FAMILY,
            fontSize: `${opts.fontSize ?? 56}px`,
            fontStyle: 'bold',
            color: opts.textColor ?? CSS.ink,
          },
        },
        false,
      )
      .setOrigin(0.5);

    this.add([bg, this.label]);
    this.setSize(w, h);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerdown', () => {
      if (!this.enabled) return;
      this.pressed = true;
      // Press effect scales the contents, so a layout scale on the button itself is kept.
      this.each((child: Phaser.GameObjects.Components.Transform) => child.setScale(0.96));
    });
    this.on('pointerout', () => this.release());
    this.on('pointerup', () => {
      const wasPressed = this.pressed;
      this.release();
      if (wasPressed && this.enabled) {
        audio().play('tap');
        onTap();
      }
    });

    if (opts.name) this.setName(opts.name);
    scene.add.existing(this);
  }

  private enabled = true;

  get isEnabled(): boolean {
    return this.enabled;
  }

  /** Disabled buttons are faded and ignore taps. */
  setEnabled(enabled: boolean): this {
    this.enabled = enabled;
    this.setAlpha(enabled ? 1 : 0.45);
    if (!enabled) this.release();
    return this;
  }

  setLabel(text: string): this {
    this.label.setText(text);
    return this;
  }

  private release(): void {
    this.pressed = false;
    this.each((child: Phaser.GameObjects.Components.Transform) => child.setScale(1));
  }
}
