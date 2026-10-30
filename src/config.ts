import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';

export const GAME_WIDTH = 1080;
export const GAME_HEIGHT = 1920;

// TODO-BRAND: replace with Domochi brand colors once provided.
export const COLORS = {
  background: 0x2b2118,
  cream: 0xfff4e0,
  dough: 0xe8c28a,
  accent: 0xf28cb1,
} as const;

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: COLORS.background,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  input: {
    activePointers: 2,
  },
  scene: [BootScene],
};
