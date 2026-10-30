import Phaser from 'phaser';
import { COLORS } from './theme';

/** Bigger than any game size (long side is at most 1080 × MAX_ASPECT), so it never needs resizing. */
const COVER = 4000;

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
  return scene.add.rectangle(0, 0, COVER, COVER, 0x000000, alpha).setOrigin(0).setInteractive();
}

/** Invisible full-screen tap catcher. */
export function addTapArea(scene: Phaser.Scene): Phaser.GameObjects.Zone {
  return scene.add.zone(0, 0, COVER, COVER).setOrigin(0).setInteractive();
}

/** Rounded cream card of size w×h drawn around its own origin; position it with setPosition. */
export function addCard(scene: Phaser.Scene, w: number, h: number): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.25);
  g.fillRoundedRect(-w / 2, -h / 2 + 12, w, h, 48);
  g.fillStyle(COLORS.card);
  g.fillRoundedRect(-w / 2, -h / 2, w, h, 48);
  return g;
}
