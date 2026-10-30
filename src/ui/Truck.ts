import Phaser from 'phaser';
import { AnimKeys, TRUCK_SPEC, TextureKeys } from '../assets/keys';
import { CSS, FONT_FAMILY } from './theme';

/** The Domochi food truck with Ethan waving in the window, centred on (x, y). */
export class Truck extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);
    const left = -TRUCK_SPEC.width / 2;
    const top = -TRUCK_SPEC.height / 2;

    const truck = new Phaser.GameObjects.Image(scene, 0, 0, TextureKeys.Truck);
    const ethan = new Phaser.GameObjects.Sprite(
      scene,
      left + TRUCK_SPEC.windowBottomCenter.x,
      top + TRUCK_SPEC.windowBottomCenter.y,
      TextureKeys.Ethan,
    ).setOrigin(0.5, 1);
    ethan.play(AnimKeys.EthanWave);

    // TODO-BRAND: replace with the real logo once provided.
    const sign = scene.make
      .text(
        {
          x: left + TRUCK_SPEC.signCenter.x,
          y: top + TRUCK_SPEC.signCenter.y,
          text: 'DOMOCHI',
          style: { fontFamily: FONT_FAMILY, fontSize: '56px', fontStyle: 'bold', color: CSS.cream },
        },
        false,
      )
      .setOrigin(0.5);

    this.add([truck, ethan, sign]);
    scene.add.existing(this);
  }
}
