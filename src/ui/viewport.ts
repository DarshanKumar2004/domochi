import Phaser from 'phaser';
import { gameSizeFor, viewportFor, type Viewport } from './layout';

export function getViewport(scene: Phaser.Scene): Viewport {
  return viewportFor(scene.scale.width, scene.scale.height);
}

/**
 * Run `layout` now and again whenever the game is resized (window resize or
 * phone rotation). Scenes create their objects once in create() and only
 * position them in `layout`, so a rotation keeps all state.
 */
export function onLayout(scene: Phaser.Scene, layout: (v: Viewport) => void): void {
  const handler = (): void => layout(getViewport(scene));
  handler();
  scene.scale.on(Phaser.Scale.Events.RESIZE, handler);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.scale.off(Phaser.Scale.Events.RESIZE, handler));
}

/** Keep the game size matched to the window's shape. Call once after creating the game. */
export function watchWindowSize(game: Phaser.Game): void {
  const apply = (): void => {
    const size = gameSizeFor(window.innerWidth, window.innerHeight);
    if (size.width !== game.scale.width || size.height !== game.scale.height) {
      game.scale.setGameSize(size.width, size.height);
    }
  };
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', apply);
}
