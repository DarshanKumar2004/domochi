import type Phaser from 'phaser';
import type { TextureKey } from './keys';

/** A real art file in public/assets/. Any key not listed here uses a code-drawn placeholder. */
export interface AssetFile {
  key: TextureKey;
  /** Path relative to public/, e.g. 'assets/truck.png'. */
  path: string;
  /** Set for sprite sheets. */
  frameWidth?: number;
  frameHeight?: number;
  /** Load in BootScene, because the loading screen itself needs it. */
  boot?: boolean;
}

// To replace a placeholder: drop the PNG in public/assets/, add a line here,
// and update assets/MANIFEST.md. Example:
// { key: TextureKeys.Truck, path: 'assets/truck.png', boot: true },
export const ASSET_FILES: AssetFile[] = [];

export function queueAssetFile(scene: Phaser.Scene, file: AssetFile): void {
  if (file.frameWidth !== undefined) {
    scene.load.spritesheet(file.key, file.path, {
      frameWidth: file.frameWidth,
      frameHeight: file.frameHeight ?? file.frameWidth,
    });
  } else {
    scene.load.image(file.key, file.path);
  }
}
