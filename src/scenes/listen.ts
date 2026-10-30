import Phaser from 'phaser';
import type { Emitter } from '../systems/events';

/** Subscribe a scene to a systems event, unsubscribing automatically when the scene shuts down. */
export function listen<E extends Record<string, unknown>, K extends keyof E>(
  scene: Phaser.Scene,
  emitter: Emitter<E>,
  event: K,
  fn: (payload: E[K]) => void,
): void {
  const off = emitter.on(event, fn);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, off);
}
