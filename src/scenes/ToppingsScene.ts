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
      this.donut.setPosition(c.x + 640, c.y + 440).setScale(1.2);
      this.jars.forEach((j, i) => j.setPosition(c.x + 1300 + (i % 2) * 280, c.y + 310 + Math.floor(i / 2) * 270));
    } else {
      this.donut.setPosition(c.x + 540, c.y + 620).setScale(1.5);
      this.jars.forEach((j, i) => j.setPosition(c.x + 180 + i * 240, c.y + 1270));
    }
  }
}
