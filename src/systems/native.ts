// The Android app (Capacitor): saves in the phone's own storage, the back
// button, full screen, a locked orientation, and the share sheet. On the web
// every one of these is a no-op, so the same build runs in both.
import { App } from '@capacitor/app';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
import { Share } from '@capacitor/share';
import { StatusBar } from '@capacitor/status-bar';
import type { SaveStorage } from './SaveService';

export type OrientationChoice = 'landscape' | 'portrait' | 'auto';

/** The app's own plugin (android/.../OrientationPlugin.java): landscape and portrait follow the sensor, so either way up works. */
const Orientation = registerPlugin<{ set(o: { mode: OrientationChoice }): Promise<void> }>('Orientation');

/** Running as the installed app (not in a browser)? */
export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * The phone's own key-value storage (safer than the web view's, which Android
 * can clear). The first time, a save from before (in localStorage) moves over.
 */
export class PreferencesStorage implements SaveStorage {
  async get(key: string): Promise<string | null> {
    const { value } = await Preferences.get({ key });
    if (value !== null) return value;
    try {
      const old = globalThis.localStorage?.getItem(key) ?? null;
      if (old !== null) await Preferences.set({ key, value: old });
      return old;
    } catch {
      return null;
    }
  }
  async set(key: string, value: string): Promise<void> {
    await Preferences.set({ key, value });
  }
  async remove(key: string): Promise<void> {
    await Preferences.remove({ key });
  }
}

/** Lock the screen the way the player chose (the app starts in landscape). */
export async function applyOrientation(choice: OrientationChoice): Promise<void> {
  if (!isNative()) return;
  try {
    await Orientation.set({ mode: choice });
  } catch (e) {
    console.warn('[native] could not set the orientation', e);
  }
}

/**
 * App start-up: full screen (no status bar), sound off while the app is in
 * the background, and the back button handled by the game (`onBack` returns
 * true if it did something; otherwise the app goes to the background).
 */
export async function initNative(opts: { orientation: OrientationChoice; onBack: () => boolean; onPause: (paused: boolean) => void }): Promise<void> {
  if (!isNative()) return;
  await applyOrientation(opts.orientation);
  try {
    await StatusBar.hide();
  } catch {
    // Some phones don't allow it: the game still fits.
  }
  void App.addListener('backButton', () => {
    if (!opts.onBack()) void App.minimizeApp();
  });
  void App.addListener('pause', () => opts.onPause(true));
  void App.addListener('resume', () => opts.onPause(false));
}

/** Share a picture through Android's share sheet (it has to be a file first). */
export async function shareImageNative(blob: Blob, fileName: string, title: string, text: string): Promise<'shared' | 'cancelled'> {
  const data = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
  const { uri } = await Filesystem.writeFile({ path: fileName, data, directory: Directory.Cache });
  try {
    await Share.share({ title, text, files: [uri] });
    return 'shared';
  } catch {
    return 'cancelled';
  }
}
