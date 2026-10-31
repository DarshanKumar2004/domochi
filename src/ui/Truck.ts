import Phaser from 'phaser';
import { AnimKeys, TRUCK_SPEC, TextureKeys } from '../assets/keys';
import brand from '../data/brand.json';
import { COLORS, CSS, FONT_FAMILY } from './theme';

/** domochi's trailer with Ethan waving in the window, centred on (x, y). */
export class Truck extends Phaser.GameObjects.Container {
  private readonly sign: Phaser.GameObjects.Text;
  /** The hanging sign (plate + text): it flips over when the shop opens or closes. */
  private readonly signPlate: Phaser.GameObjects.Container;
  private open: boolean | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);
    const left = -TRUCK_SPEC.width / 2;
    const top = -TRUCK_SPEC.height / 2;
    const at = (p: { x: number; y: number }): [number, number] => [left + p.x, top + p.y];

    const truck = new Phaser.GameObjects.Image(scene, 0, 0, TextureKeys.Truck);
    const ethan = new Phaser.GameObjects.Sprite(scene, ...at(TRUCK_SPEC.windowBottomCenter), TextureKeys.Ethan)
      .setOrigin(0.5, 1)
      .setScale(TRUCK_SPEC.ethanScale);
    ethan.play(AnimKeys.EthanWave);

    const logo = new Phaser.GameObjects.Image(scene, ...at(TRUCK_SPEC.logoCenter), TextureKeys.Logo);
    logo.setDisplaySize(TRUCK_SPEC.logoSize, TRUCK_SPEC.logoSize);

    const text = (p: { x: number; y: number }, s: string, size: number, color: string, bold = false) =>
      scene.make
        .text(
          {
            x: left + p.x,
            y: top + p.y,
            text: s,
            style: { fontFamily: FONT_FAMILY, fontSize: `${size}px`, fontStyle: bold ? 'bold' : 'normal', color },
          },
          false,
        )
        .setOrigin(0.5);

    const [sx, sy] = at(TRUCK_SPEC.openSignCenter);
    const plate = new Phaser.GameObjects.Graphics(scene);
    plate.fillStyle(COLORS.ink);
    plate.fillEllipse(0, 0, 150, 66);
    this.sign = text({ x: TRUCK_SPEC.width / 2, y: TRUCK_SPEC.height / 2 }, 'OPEN', 38, CSS.pink, true);
    this.signPlate = new Phaser.GameObjects.Container(scene, sx, sy, [plate, this.sign]).setName('truck-sign');
    this.add([truck, ethan, logo, this.signPlate, text(TRUCK_SPEC.handleCenter, brand.instagram, 30, CSS.ink)]);
    scene.add.existing(this);
  }

  /** The window sign: OPEN (pink) or CLOSED (before opening and after closing). It flips over when it changes. */
  setOpen(open: boolean): this {
    if (open === this.open) return this;
    const first = this.open === null;
    this.open = open;
    const apply = () => this.sign.setText(open ? 'OPEN' : 'CLOSED').setFontSize(open ? 38 : 30).setColor(open ? CSS.pink : CSS.cream);
    if (first) {
      apply();
      return this;
    }
    // Turn the sign edge-on, swap the side, turn it back with a little swing.
    const tweens = this.scene.tweens;
    tweens.killTweensOf(this.signPlate);
    this.signPlate.setScale(1, 1).setAngle(0);
    tweens.chain({
      targets: this.signPlate,
      tweens: [
        { scaleX: 0, duration: 170, ease: 'Cubic.In', onComplete: apply },
        { scaleX: 1, duration: 260, ease: 'Back.Out' },
        { angle: { from: 9, to: 0 }, duration: 700, ease: 'Elastic.Out' },
      ],
    });
    return this;
  }
}
