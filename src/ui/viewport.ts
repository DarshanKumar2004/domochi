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

/** Game size for the container's current on-screen size. */
export function measureGameSize(container: HTMLElement): { width: number; height: number } {
  const r = container.getBoundingClientRect();
  return gameSizeFor(r.width, r.height);
}

/** Re-measure this long after the last resize-ish event, to catch sizes that settle late. */
const SETTLE_CHECKS_MS = [100, 300, 700];

/**
 * Keep the game size matched to the container's shape.
 *
 * Phone rotation is messy: browsers fire several events while sizes are still
 * changing, and sizes read inside those events can be stale. So we never trust
 * a single event. We measure the container (not window.innerWidth), re-check a
 * few times after things go quiet, and always ask Phaser to re-fit the canvas
 * even when the game size didn't change.
 */
export function watchContainerSize(game: Phaser.Game, container: HTMLElement): void {
  const apply = (): void => {
    const size = measureGameSize(container);
    if (size.width !== game.scale.width || size.height !== game.scale.height) {
      game.scale.setGameSize(size.width, size.height);
    }
    game.scale.refresh();
  };

  let timers: number[] = [];
  const schedule = (): void => {
    for (const t of timers) window.clearTimeout(t);
    requestAnimationFrame(apply);
    timers = SETTLE_CHECKS_MS.map((ms) => window.setTimeout(apply, ms));
  };

  new ResizeObserver(schedule).observe(container);
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
  window.visualViewport?.addEventListener('resize', schedule);
}
