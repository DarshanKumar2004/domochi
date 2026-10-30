import { TextureKeys } from '../assets/keys';
import { GAME_WIDTH } from '../ui/layout';
import { SceneKeys } from './sceneKeys';
import { StationScene } from './StationScene';

// TODO-BRAND: station background colors.
export class FryScene extends StationScene {
  constructor() {
    super(SceneKeys.Fry, 'Fry Station', 0x4a3a30, 3);
  }

  protected buildStation(): void {
    this.add.image(GAME_WIDTH / 2, 900, TextureKeys.Fryer);
    const donut = this.add.image(GAME_WIDTH / 2 - 110, 870, TextureKeys.DonutPlain).setScale(0.75);
    this.tweens.add({ targets: donut, y: donut.y - 12, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
  }
}
