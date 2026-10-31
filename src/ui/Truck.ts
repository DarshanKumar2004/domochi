import Phaser from 'phaser';
import { AnimKeys, TRUCK_SPEC, TextureKeys } from '../assets/keys';
import brand from '../data/brand.json';
import { CSS, FONT_FAMILY } from './theme';

/** domochi's trailer with Ethan waving in the window, centred on (x, y). */
export class Truck extends Phaser.GameObjects.Container {
  private readonly sign: Phaser.GameObjects.Text;

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

    this.sign = text(TRUCK_SPEC.openSignCenter, 'OPEN', 38, CSS.pink, true);
    this.add([truck, ethan, logo, this.sign, text(TRUCK_SPEC.handleCenter, brand.instagram, 30, CSS.ink)]);
    scene.add.existing(this);
  }

  /** The window sign: OPEN (pink) or CLOSED (before opening and after closing). */
  setOpen(open: boolean): this {
    this.sign.setText(open ? 'OPEN' : 'CLOSED').setFontSize(open ? 38 : 30).setColor(open ? CSS.pink : CSS.cream);
    return this;
  }
}
