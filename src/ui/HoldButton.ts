import Phaser from 'phaser';
import { MIN_HIT_SIZE } from './layout';
import { COLORS, CSS, FONT_FAMILY } from './theme';

/**
 * A button you press and hold (e.g. the fryer grate). onChange(true) on press,
 * onChange(false) on release, sliding off, or the pointer lifting anywhere.
 */
export class HoldButton extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private held = false;
  private enabled = true;
  private readonly bw: number;
  private readonly bh: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    text: string,
    private readonly onChange: (held: boolean) => void,
    width = 320,
    height = 150,
    name?: string,
  ) {
    super(scene, x, y);
    this.bw = Math.max(width, MIN_HIT_SIZE);
    this.bh = Math.max(height, MIN_HIT_SIZE);
    this.bg = scene.make.graphics({}, false);
    this.label = scene.make
      .text({ text, style: { fontFamily: FONT_FAMILY, fontSize: '44px', fontStyle: 'bold', color: CSS.ink, align: 'center' } }, false)
      .setOrigin(0.5);
    this.add([this.bg, this.label]);
    this.draw();

    this.setSize(this.bw, this.bh);
    this.setInteractive({ useHandCursor: true });
    this.on(Phaser.Input.Events.POINTER_DOWN, () => this.set(true));
    this.on(Phaser.Input.Events.POINTER_OUT, () => this.set(false));
    // Lifting the finger anywhere releases it, even off the button.
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.release, this);
    this.once(Phaser.GameObjects.Events.DESTROY, () => scene.input.off(Phaser.Input.Events.POINTER_UP, this.release, this));
    if (name) this.setName(name);
    scene.add.existing(this);
  }

  get isHeld(): boolean {
    return this.held;
  }

  setEnabled(enabled: boolean): this {
    if (enabled === this.enabled) return this;
    this.enabled = enabled;
    this.setAlpha(enabled ? 1 : 0.45);
    if (!enabled) this.set(false);
    return this;
  }

  release(): void {
    this.set(false);
  }

  private set(held: boolean): void {
    if (held && !this.enabled) return;
    if (held === this.held) return;
    this.held = held;
    this.draw();
    this.onChange(held);
  }

  private draw(): void {
    const w = this.bw;
    const h = this.bh;
    const g = this.bg;
    const press = this.held ? 8 : 0;
    g.clear();
    if (!this.held) {
      g.fillStyle(0x000000, 0.25);
      g.fillRoundedRect(-w / 2, -h / 2 + 8, w, h, 36);
    }
    g.fillStyle(this.held ? COLORS.pinkDark : COLORS.cream);
    g.fillRoundedRect(-w / 2, -h / 2 + press, w, h, 36);
    g.lineStyle(5, COLORS.ink);
    g.strokeRoundedRect(-w / 2, -h / 2 + press, w, h, 36);
    this.label.setY(press);
  }
}
