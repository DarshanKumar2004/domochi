import Phaser from 'phaser';
import { TextureKeys } from '../assets/keys';
import type { Viewport } from '../ui/layout';
import { SceneKeys } from './sceneKeys';
import { StationScene } from './StationScene';

// TODO-BRAND: station background colors.
export class FryScene extends StationScene {
  private fryer!: Phaser.GameObjects.Image;
  private donut!: Phaser.GameObjects.Image;

  constructor() {
    super(SceneKeys.Fry, 'Fry Station', 0x4a3a30, 3);
  }

  protected buildStation(): void {
    this.fryer = this.add.image(0, 0, TextureKeys.Fryer);
    this.donut = this.add.image(0, 0, TextureKeys.DonutPlain).setScale(0.75);
    this.tweens.add({ targets: this.donut, angle: 4, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
  }

  protected layoutStation(v: Viewport): void {
    const cx = v.width / 2;
    const L = v.orientation === 'landscape';
    const cy = v.content.y + (L ? 470 : 800);
    this.fryer.setScale(L ? 0.9 : 1);
    this.fryer.setPosition(cx, cy);
    this.donut.setPosition(cx - 110, cy - 30);
  }
}
