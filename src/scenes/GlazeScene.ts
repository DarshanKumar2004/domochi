import { TextureKeys } from '../assets/keys';
import { GAME_WIDTH } from '../ui/layout';
import { SceneKeys } from './sceneKeys';
import { StationScene } from './StationScene';

export class GlazeScene extends StationScene {
  constructor() {
    super(SceneKeys.Glaze, 'Glaze Station', 0x6b4a5a, 4);
  }

  protected buildStation(): void {
    this.add.image(GAME_WIDTH / 2, 760, TextureKeys.DonutPlain).setScale(1.6);
    for (const x of [220, 540, 860]) this.add.image(x, 1380, TextureKeys.GlazeBowl);
  }
}
