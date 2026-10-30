import Phaser from 'phaser';
import { TextureKeys } from '../assets/keys';
import type { Viewport } from '../ui/layout';
import { SceneKeys } from './sceneKeys';
import { StationScene } from './StationScene';

export class GlazeScene extends StationScene {
  private donut!: Phaser.GameObjects.Image;
  private bowls: Phaser.GameObjects.Image[] = [];

  constructor() {
    super(SceneKeys.Glaze, 'Glaze Station', 0x6b4a5a, 4);
  }

  protected buildStation(): void {
    this.donut = this.add.image(0, 0, TextureKeys.DonutPlain);
    this.bowls = [0, 1, 2].map(() => this.add.image(0, 0, TextureKeys.GlazeBowl));
  }

  protected layoutStation(v: Viewport): void {
    const c = v.content;
    if (v.orientation === 'landscape') {
      // Donut on the left, bowls in a row on the right.
      this.donut.setPosition(c.x + 640, c.y + 440).setScale(1.2);
      this.bowls.forEach((b, i) => b.setPosition(c.x + 1230 + i * 270, c.y + 460));
    } else {
      // Donut on top, bowls in a row below.
      this.donut.setPosition(c.x + 540, c.y + 620).setScale(1.5);
      this.bowls.forEach((b, i) => b.setPosition(c.x + 220 + i * 320, c.y + 1250));
    }
  }
}
