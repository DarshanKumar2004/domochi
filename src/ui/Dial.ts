import Phaser from 'phaser';
import { COLORS, CSS, FONT_FAMILY } from './theme';

const SWEEP = 135;
const GOOD = 0x7fd1ae;
const HOT = 0xe85d4a;

/**
 * A heat dial (the oven's; the fryer has its own): drag round it to set a
 * temperature. A green arc marks the ideal range. Sized `r`.
 */
export class Dial extends Phaser.GameObjects.Container {
  private readonly needle: Phaser.GameObjects.Container;
  private dragging = false;

  constructor(
    scene: Phaser.Scene,
    r: number,
    private readonly min: number,
    private readonly max: number,
    ideal: { min: number; max: number },
    private readonly onSet: (f: number) => void,
    name: string,
  ) {
    super(scene, 0, 0);
    const face = scene.make.graphics({}, false);
    face.fillStyle(0x000000, 0.25);
    face.fillCircle(0, 8, r);
    face.fillStyle(COLORS.cream);
    face.fillCircle(0, 0, r);
    face.lineStyle(6, COLORS.ink);
    face.strokeCircle(0, 0, r);
    face.lineStyle(4, COLORS.ink);
    for (let a = -SWEEP; a <= SWEEP; a += 27) {
      const rad = Phaser.Math.DegToRad(a - 90);
      face.lineBetween(Math.cos(rad) * (r - 6), Math.sin(rad) * (r - 6), Math.cos(rad) * (r - 26), Math.sin(rad) * (r - 26));
    }
    const toRad = (f: number) => Phaser.Math.DegToRad(this.angleFor(f) - 90);
    face.lineStyle(14, GOOD);
    face.beginPath();
    face.arc(0, 0, r - 16, toRad(ideal.min), toRad(ideal.max));
    face.strokePath();
    const style = { fontFamily: FONT_FAMILY, fontSize: '28px', color: CSS.cream };
    const lo = scene.make.text({ x: -r * 0.7, y: r + 24, text: 'low', style }, false).setOrigin(0.5);
    const hi = scene.make.text({ x: r * 0.7, y: r + 24, text: 'high', style }, false).setOrigin(0.5);
    const bar = new Phaser.GameObjects.Rectangle(scene, 0, 0, 12, r - 28, HOT).setOrigin(0.5, 1);
    this.needle = new Phaser.GameObjects.Container(scene, 0, 0, [bar]);
    const hub = new Phaser.GameObjects.Arc(scene, 0, 0, 16, 0, 360, false, COLORS.ink);
    const hit = new Phaser.GameObjects.Zone(scene, 0, 0, r * 2.4, r * 2.4).setName(name);
    hit.setInteractive(new Phaser.Geom.Circle(r * 1.2, r * 1.2, r * 1.2), Phaser.Geom.Circle.Contains);
    this.add([face, lo, hi, this.needle, hub, hit]);
    hit.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      this.dragging = true;
      this.fromPointer(p);
    });
    const move = (p: Phaser.Input.Pointer) => {
      if (this.dragging && p.isDown) this.fromPointer(p);
    };
    const up = () => (this.dragging = false);
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, move);
    scene.input.on(Phaser.Input.Events.POINTER_UP, up);
    this.once(Phaser.GameObjects.Events.DESTROY, () => {
      scene.input.off(Phaser.Input.Events.POINTER_MOVE, move);
      scene.input.off(Phaser.Input.Events.POINTER_UP, up);
    });
    scene.add.existing(this);
  }

  private angleFor(f: number): number {
    return -SWEEP + ((f - this.min) / (this.max - this.min)) * SWEEP * 2;
  }

  /** Point the needle at a setting. */
  show(f: number): void {
    this.needle.setAngle(this.angleFor(f));
  }

  private fromPointer(p: Phaser.Input.Pointer): void {
    const m = this.getWorldTransformMatrix();
    const a = Phaser.Math.Clamp(Phaser.Math.RadToDeg(Math.atan2(p.worldX - m.tx, -(p.worldY - m.ty))), -SWEEP, SWEEP);
    const f = this.min + ((a + SWEEP) / (SWEEP * 2)) * (this.max - this.min);
    this.onSet(Math.round(f / 5) * 5);
  }
}
