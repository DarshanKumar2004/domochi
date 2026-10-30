import type Phaser from 'phaser';
import { save, startSession } from '../systems/services';
import type { HudScene } from './HudScene';
import { SceneKeys, type SceneKey } from './sceneKeys';

/** Scenes that make up the running game (everything after Preload/Tutorial). */
const MAIN_GAME_SCENES: readonly SceneKey[] = [
  SceneKeys.Lobby,
  SceneKeys.Fry,
  SceneKeys.Glaze,
  SceneKeys.Toppings,
  SceneKeys.Box,
  SceneKeys.Hud,
  SceneKeys.Order,
  SceneKeys.Serve,
  SceneKeys.Settings,
  SceneKeys.TicketView,
];

/** Leave `from` and enter the game at the Lobby, with the tab bar on top, starting a fresh day. */
export function startMainGame(from: Phaser.Scene): void {
  startSession(save().data.day);
  from.scene.launch(SceneKeys.Lobby);
  from.scene.launch(SceneKeys.Hud);
  from.scene.stop();
}

/** Stop every main-game scene except the caller (which should then start something else). */
export function stopMainGame(from: Phaser.Scene): void {
  const mgr = from.scene.manager;
  for (const key of MAIN_GAME_SCENES) {
    if (key === from.scene.key) continue;
    if (mgr.isActive(key) || mgr.isSleeping(key) || mgr.isPaused(key)) from.scene.stop(key);
  }
}

export function getHud(from: Phaser.Scene): HudScene {
  return from.scene.get(SceneKeys.Hud) as HudScene;
}
