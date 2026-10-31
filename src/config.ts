import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { BoxScene } from './scenes/BoxScene';
import { DaySummaryScene } from './scenes/DaySummaryScene';
import { DoughScene } from './scenes/DoughScene';
import { InviteScene } from './scenes/InviteScene';
import { FryScene } from './scenes/FryScene';
import { GlazeScene } from './scenes/GlazeScene';
import { HudScene } from './scenes/HudScene';
import { LobbyScene } from './scenes/LobbyScene';
import { OrderScene } from './scenes/OrderScene';
import { PreloadScene } from './scenes/PreloadScene';
import { ServeScene } from './scenes/ServeScene';
import { SettingsScene } from './scenes/SettingsScene';
import { ToppingsScene } from './scenes/ToppingsScene';
import { TicketViewScene } from './scenes/TicketViewScene';
import { TutorialScene } from './scenes/TutorialScene';
import { COLORS } from './ui/theme';

/** Phaser config for a starting game size (see gameSizeFor in ui/layout.ts). */
export function createGameConfig(width: number, height: number): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent: 'game',
    width,
    height,
    backgroundColor: COLORS.bg,
    scale: {
      // The game size always matches the window's shape (see watchWindowSize),
      // so FIT fills the screen; it only letterboxes beyond MAX_ASPECT.
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
      DoughScene,
      FryScene,
      GlazeScene,
      ToppingsScene,
      BoxScene,
      HudScene,
      OrderScene,
      ServeScene,
      SettingsScene,
      TicketViewScene,
      DaySummaryScene,
      InviteScene,
    ],
  };
}
