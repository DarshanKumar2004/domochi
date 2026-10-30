import { TextureKeys } from '../assets/keys';
import { GAME_WIDTH } from '../ui/layout';
import { SceneKeys } from './sceneKeys';
import { StationScene } from './StationScene';

export class ToppingsScene extends StationScene {
  constructor() {
    super(SceneKeys.Toppings, 'Toppings Station', 0x4a5a6b, 5);
  }

  protected buildStation(): void {
    this.add.image(GAME_WIDTH / 2, 760, TextureKeys.DonutPlain).setScale(1.6);
    for (const x of [180, 420, 660, 900]) this.add.image(x, 1400, TextureKeys.ToppingJar);
  }
}
