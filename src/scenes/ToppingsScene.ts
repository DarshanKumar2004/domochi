import Phaser from 'phaser';
import { TextureKeys } from '../assets/keys';
import type { Viewport } from '../ui/layout';
import { SceneKeys } from './sceneKeys';
import { StationScene } from './StationScene';

export class ToppingsScene extends StationScene {
  private donut!: Phaser.GameObjects.Image;
  private jars: Phaser.GameObjects.Image[] = [];

  constructor() {
    super(SceneKeys.Toppings, 'Toppings Station', 0x4a5a6b, 5);
  }

  protected buildStation(): void {
    this.donut = this.add.image(0, 0, TextureKeys.DonutPlain);
    this.jars = [0, 1, 2, 3].map(() => this.add.image(0, 0, TextureKeys.ToppingJar));
  }

  protected layoutStation(v: Viewport): void {
    const c = v.content;
    if (v.orientation === 'landscape') {
      // Donut on the left, jars in a 2×2 grid on the right.
      this.donut.setPosition(c.x + 640, c.y + 540).setScale(1.4);
      this.jars.forEach((j, i) => j.setPosition(c.x + 1300 + (i % 2) * 280, c.y + 410 + Math.floor(i / 2) * 290));
    } else {
      this.donut.setPosition(c.x + 540, c.y + 760).setScale(1.6);
      this.jars.forEach((j, i) => j.setPosition(c.x + 180 + i * 240, c.y + 1400));
    }
  }
}
