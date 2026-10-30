import { TextureKeys } from '../assets/keys';
import { Button } from '../ui/Button';
import { GAME_WIDTH } from '../ui/layout';
import { getHud } from './flow';
import { SceneKeys } from './sceneKeys';
import { StationScene } from './StationScene';

export class BoxScene extends StationScene {
  constructor() {
    super(SceneKeys.Box, 'Box Station', 0x5a6b4a, 5);
  }

  protected buildStation(): void {
    this.add.image(GAME_WIDTH / 2, 820, TextureKeys.DonutBox).setScale(1.3);
    new Button(this, GAME_WIDTH / 2, 1440, 'Close lid & serve', () => this.serve(), {
      width: 640,
      name: 'btn-serve',
    });
  }

  /** Serving cuts back to the Lobby, where the result card pops up. */
  private serve(): void {
    getHud(this).goTo(SceneKeys.Lobby);
    this.scene.launch(SceneKeys.Serve);
  }
}
