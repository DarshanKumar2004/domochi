import type Phaser from 'phaser';
import type { HudScene } from './HudScene';
import { SceneKeys } from './sceneKeys';

/** Pop-ups the back button closes (others, like the day summary, wait for their own button). */
const CLOSABLE = [SceneKeys.Settings, SceneKeys.TicketView, SceneKeys.Journal] as const;

/**
 * Android's back button: close the top pop-up, or go from a station back to
 * the Lobby. Returns false when there's nothing to go back from (the app then
 * goes to the background, like any game).
 */
export function handleBack(game: Phaser.Game): boolean {
  // An HTML card (about us, a note for Ethan, joining the team): tap outside it.
  const back = document.querySelector<HTMLElement>('.dm-back');
  if (back) {
    back.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    return true;
  }
  const mgr = game.scene;
  for (const key of CLOSABLE) {
    if (mgr.isActive(key)) {
      mgr.stop(key);
      return true;
    }
  }
  if (mgr.isActive(SceneKeys.Hud)) {
    const hud = mgr.getScene(SceneKeys.Hud) as HudScene;
    if (hud.currentStation !== SceneKeys.Lobby) {
      hud.goTo(SceneKeys.Lobby);
      return true;
    }
  }
  return false;
}
