import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './layout';
import { COLORS } from './theme';

/**
 * Call first in a popup scene's create(). Moves the popup above every other
 * scene (including the tab bar), then adds a full-screen dimmer that swallows
 * taps so nothing underneath reacts while the popup is open.
 *
 * Bringing to top matters: scenes keep their slot in the scene list when
 * launched, and HudScene moves itself to the top on every tab switch.
 */
export function beginOverlay(scene: Phaser.Scene, alpha = 0.55): Phaser.GameObjects.Rectangle {
  scene.scene.bringToTop();
  return scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, alpha).setOrigin(0).setInteractive();
}

/** Rounded cream card centred on (x, y). */
export function addCard(scene: Phaser.Scene, x: number, y: number, w: number, h: number): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.25);
  g.fillRoundedRect(x - w / 2, y - h / 2 + 12, w, h, 48);
  g.fillStyle(COLORS.card);
  g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 48);
  return g;
}
