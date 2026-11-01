import Phaser from 'phaser';
import { COLORS, CSS, FONT_FAMILY } from './theme';

/** Footprint of each box size (single bag → domochi box), px at scale 1. */
const WIDTH: Record<number, number> = { 1: 90, 3: 170, 6: 215, 12: 255 };
const THICK = 30;
/** Most boxes drawn in a pile (the label gives the real count). */
const MAX_DRAWN = 3;

/**
 * A little pile of flat-packed boxes on the counter (or paper bags for a
 * single): bigger boxes are wider, and the pile shows how many you have.
 * Tap it to pack the order in that box.
 */
export class BoxPile extends Phaser.GameObjects.Container {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private readonly footprint: number;

  constructor(
    scene: Phaser.Scene,
    readonly boxId: string,
    readonly slots: number,
    private readonly title: string,
    onPick: () => void,
  ) {
    super(scene, 0, 0);
    this.footprint = WIDTH[slots] ?? 200;
    this.g = scene.add.graphics();
    this.label = scene.add.text(0, 14, '', { fontFamily: FONT_FAMILY, fontSize: '30px', fontStyle: 'bold', color: CSS.cream, align: 'center' }).setOrigin(0.5, 0);
    this.add([this.g, this.label]);
    // The tap area covers the pile and its label.
    const h = THICK * MAX_DRAWN + 70;
    this.setSize(Math.max(this.footprint, 160) + 20, h);
    this.setInteractive(new Phaser.Geom.Rectangle(-this.width / 2, -THICK * MAX_DRAWN - 16, this.width, h), Phaser.Geom.Rectangle.Contains);
    this.input!.cursor = 'pointer';
    this.on(Phaser.Input.Events.POINTER_UP, onPick);
    this.setName(`box-size-${boxId}`);
    scene.add.existing(this);
  }

  /** Redraw: how many are left (Infinity = not counted) and whether it's the one picked. */
  draw(left: number, chosen: boolean): void {
    const g = this.g;
    const w = this.footprint;
    const n = Number.isFinite(left) ? Math.min(MAX_DRAWN, Math.max(0, left)) : MAX_DRAWN;
    g.clear();
    if (chosen) {
      g.fillStyle(COLORS.pink, 0.35);
      g.fillRoundedRect(-w / 2 - 16, -THICK * MAX_DRAWN - 18, w + 32, THICK * MAX_DRAWN + 72, 22);
      g.lineStyle(6, COLORS.pink);
      g.strokeRoundedRect(-w / 2 - 16, -THICK * MAX_DRAWN - 18, w + 32, THICK * MAX_DRAWN + 72, 22);
    }
    // None left: a dashed outline where they'd be.
    if (n === 0) {
      g.lineStyle(3, COLORS.cream, 0.45);
      g.strokeRoundedRect(-w / 2, -THICK, w, THICK, 6);
    }
    for (let k = 0; k < n; k++) {
      const y = -THICK * (k + 1);
      // Each one a little off-square, like a real pile.
      const dx = ((k * 37) % 9) - 4;
      if (this.slots === 1) {
        // A paper bag with its top folded over.
        g.fillStyle(0xf3ead9);
        g.fillRoundedRect(-w / 2 + dx, y + 2, w, THICK - 2, 4);
        g.fillStyle(0xe2d4bb);
        g.fillRect(-w / 2 + dx, y + 2, w, 8);
      } else {
        g.fillStyle(0xd8b58a);
        g.fillRoundedRect(-w / 2 + dx, y + 2, w, THICK - 2, 5);
        // The lid's lip.
        g.fillStyle(0xc49d6e);
        g.fillRect(-w / 2 + dx, y + 2, w, 7);
      }
      g.lineStyle(3, COLORS.ink, 0.85);
      g.strokeRoundedRect(-w / 2 + dx, y + 2, w, THICK - 2, 5);
    }
    // The domochi ring stamped on the top one.
    if (n > 0) {
      const topY = -THICK * n + THICK / 2 + 3;
      const dx = (((n - 1) * 37) % 9) - 4;
      g.lineStyle(2.5, COLORS.ink, 0.8);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.strokeCircle(dx + Math.cos(a) * 7, topY + Math.sin(a) * 5, 3);
      }
    }
    this.label.setText(Number.isFinite(left) ? `${this.title} · ${left}` : this.title).setColor(Number.isFinite(left) && left < 1 ? '#ffb4a8' : CSS.cream);
  }
}
