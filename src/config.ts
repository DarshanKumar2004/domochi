import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { BoxScene } from './scenes/BoxScene';
import { FryScene } from './scenes/FryScene';
import { GlazeScene } from './scenes/GlazeScene';
import { HudScene } from './scenes/HudScene';
import { LobbyScene } from './scenes/LobbyScene';
import { OrderScene } from './scenes/OrderScene';
import { PreloadScene } from './scenes/PreloadScene';
import { ServeScene } from './scenes/ServeScene';
import { SettingsScene } from './scenes/SettingsScene';
import { ToppingsScene } from './scenes/ToppingsScene';
import { TutorialScene } from './scenes/TutorialScene';
import { GAME_HEIGHT, GAME_WIDTH } from './ui/layout';
import { COLORS } from './ui/theme';

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: COLORS.bg,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  input: {
    activePointers: 2,
  },
  // The first scene starts automatically; the rest are started by the game flow.
  scene: [
    BootScene,
    PreloadScene,
    TutorialScene,
    LobbyScene,
    FryScene,
    GlazeScene,
    ToppingsScene,
    BoxScene,
    HudScene,
    OrderScene,
    ServeScene,
    SettingsScene,
  ],
};
