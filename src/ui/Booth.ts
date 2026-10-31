import Phaser from 'phaser';
import { AnimKeys, BOOTH_SPEC, TextureKeys } from '../assets/keys';
import { CSS, FONT_FAMILY } from './theme';

/** The pop-up booth for event days, with Ethan behind the table and the event on the banner. Centred on (x, y). */
export class Booth extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, x: number, y: number, eventName: string) {
    super(scene, x, y);
    const left = -BOOTH_SPEC.width / 2;
    const top = -BOOTH_SPEC.height / 2;
    // Ethan first: the table (part of the booth art) hides his legs.
    const ethan = new Phaser.GameObjects.Sprite(scene, left + BOOTH_SPEC.ethanFeet.x, top + BOOTH_SPEC.ethanFeet.y, TextureKeys.Ethan)
      .setOrigin(0.5, 1)
      .setScale(0.9);
    ethan.play(AnimKeys.EthanWave);
    const booth = new Phaser.GameObjects.Image(scene, 0, 0, TextureKeys.PopupBooth);
    const b = BOOTH_SPEC.bannerCenter;
    const logo = new Phaser.GameObjects.Image(scene, left + b.x - 130, top + b.y, TextureKeys.Logo).setDisplaySize(115, 115);
    const text = (dy: number, s: string, size: number, bold: boolean) =>
      scene.make
        .text({ x: left + b.x + 50, y: top + b.y + dy, text: s, style: { fontFamily: FONT_FAMILY, fontSize: `${size}px`, fontStyle: bold ? 'bold' : 'normal', color: CSS.ink, align: 'center', wordWrap: { width: 250 } } }, false)
        .setOrigin(0.5);
    this.add([ethan, booth, logo, text(-24, 'domochi pop-up', 34, true), text(24, eventName, 28, false)]);
    this.setName('popup-booth');
    scene.add.existing(this);
  }
}
