import Phaser from 'phaser';
import { TextureKeys } from '../assets/keys';
import { Button } from '../ui/Button';
import type { Viewport } from '../ui/layout';
import { getHud } from './flow';
import { SceneKeys } from './sceneKeys';
import { StationScene } from './StationScene';

export class BoxScene extends StationScene {
  private box!: Phaser.GameObjects.Image;
  private serveButton!: Button;

  constructor() {
    super(SceneKeys.Box, 'Box Station', 0x5a6b4a, 5);
  }

  protected buildStation(): void {
    this.box = this.add.image(0, 0, TextureKeys.DonutBox);
    this.serveButton = new Button(this, 0, 0, 'Close lid & serve', () => this.serve(), {
      width: 640,
      name: 'btn-serve',
    });
  }

  protected layoutStation(v: Viewport): void {
    const c = v.content;
    if (v.orientation === 'landscape') {
      this.box.setPosition(c.x + 700, c.y + 540).setScale(1.15);
      this.serveButton.setPosition(c.x + 1450, c.y + 540);
    } else {
      this.box.setPosition(c.x + 540, c.y + 820).setScale(1.3);
      this.serveButton.setPosition(c.x + 540, c.y + 1440);
    }
  }

  /** Serving cuts back to the Lobby, where the result card pops up. */
  private serve(): void {
    getHud(this).goTo(SceneKeys.Lobby);
    this.scene.launch(SceneKeys.Serve);
  }
}
