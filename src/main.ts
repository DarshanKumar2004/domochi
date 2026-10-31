import Phaser from 'phaser';
import { createGameConfig } from './config';
import { SaveService } from './systems/SaveService';
import { audio, feedback, hasSession, save, session, setClockPaused, setSave, setSeed } from './systems/services';
import { createDefaultStorage } from './systems/storage';
import { measureGameSize, watchContainerSize } from './ui/viewport';

async function start(): Promise<void> {
  // Load the save before Phaser starts, so every scene can read it synchronously.
  setSave(await SaveService.load(createDefaultStorage()));

  // ?seed=123 makes customers and orders reproducible (handy for testing and bug reports).
  const seed = Number(new URLSearchParams(window.location.search).get('seed'));
  setSeed(Number.isInteger(seed) && seed > 0 ? seed : null);

  const container = document.getElementById('game')!;
  const size = measureGameSize(container);
  const game = new Phaser.Game(createGameConfig(size.width, size.height));
  watchContainerSize(game, container);
  // Hush when the tab or app goes to the background.
  document.addEventListener('visibilitychange', () => audio().setSuspended(document.hidden));
  // ...and pick the sound back up on the next tap if the phone paused it.
  // (iPhones only let sound resume from a finished tap, so touchend and click too.)
  for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click']) document.addEventListener(ev, () => audio().wake(), { capture: true, passive: true });
  // Clicking back into the window (or returning to the tab) brings the music back too.
  window.addEventListener('focus', () => audio().wake());
  // Leaving the page mid-press (switching apps, a notification) can swallow the finger
  // lifting: the game would think it's still held down, and pours, the sponge and
  // buttons get stuck. So on leaving and coming back, let go of every pointer.
  const letGo = () => {
    for (const p of game.input.pointers) {
      if (!p.isDown) continue;
      p.isDown = false;
      p.primaryDown = false;
      p.buttons = 0;
    }
  };
  window.addEventListener('blur', letGo);
  window.addEventListener('focus', letGo);
  window.addEventListener('pointercancel', letGo);
  document.addEventListener('visibilitychange', letGo);
  window.addEventListener('pageshow', () => audio().wake());

  // A report left from last time (no connection then, say) goes out now.
  void feedback().sendReport(save().data.day);

  // Exposed for Playwright tests.
  const w = window as unknown as { __game: Phaser.Game; __session?: unknown; __save: unknown; __setClockPaused: (p: boolean) => void };
  w.__game = game;
  w.__save = save();
  w.__setClockPaused = setClockPaused;
  Object.defineProperty(w, '__session', { get: () => (hasSession() ? session() : undefined) });
}

void start();
