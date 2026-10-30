import Phaser from 'phaser';
import { ASSET_FILES, queueAssetFile } from '../assets/files';
import brand from '../data/brand.json';
import { TextureKeys } from '../assets/keys';
import { ensurePlaceholderTextures } from '../assets/placeholders';
import { save } from '../systems/services';
import type { Viewport } from '../ui/layout';
import { COLORS, CSS, FONT_FAMILY } from '../ui/theme';
import { Truck } from '../ui/Truck';
import { onLayout } from '../ui/viewport';
import { startMainGame } from './flow';
import { SceneKeys } from './sceneKeys';

/**
 * When there are real files to load, the bar shows for at least this long so
 * it doesn't flash. With nothing to load there's no bar at all. UI pacing only.
 */
const MIN_SHOW_MS = 600;
const BAR_WIDTH = 700;
const BAR_HEIGHT = 44;

export class PreloadScene extends Phaser.Scene {
  private logo!: Phaser.GameObjects.Image;
  private subtitle!: Phaser.GameObjects.Text;
  private truck!: Truck;
  private barBg!: Phaser.GameObjects.Rectangle;
  private barFill!: Phaser.GameObjects.Rectangle;
  private prompt!: Phaser.GameObjects.Text;
  private loadProgress = 0;
  private elapsed = 0;
  private ready = false;
  /** Are there any files left to load after Boot? If not, skip the bar. */
  private hasWork = false;

  constructor() {
    super(SceneKeys.Preload);
  }

  preload(): void {
    this.loadProgress = 0;
    this.elapsed = 0;
    this.ready = false;

    // Cream, like the real trailer: the official logo is ink-on-white and its
    // hollow wordmark would vanish on a dark background.
    this.cameras.main.setBackgroundColor(COLORS.cream);
    this.logo = this.add.image(0, 0, TextureKeys.Logo);
    this.subtitle = this.add
      .text(0, 0, brand.tagline, { fontFamily: FONT_FAMILY, fontSize: '48px', color: CSS.ink })
      .setOrigin(0.5);
    this.truck = new Truck(this, 0, 0);
    this.barBg = this.add.rectangle(0, 0, BAR_WIDTH + 16, BAR_HEIGHT + 16, 0xe6e1d6);
    this.barFill = this.add.rectangle(0, 0, BAR_WIDTH, BAR_HEIGHT, COLORS.pink).setOrigin(0, 0.5).setScale(0, 1);
    this.prompt = this.add
      .text(0, 0, 'Tap to start', { fontFamily: FONT_FAMILY, fontSize: '72px', fontStyle: 'bold', color: CSS.ink })
      .setOrigin(0.5)
      .setName('prompt-start')
      .setVisible(false);
    onLayout(this, (v) => this.layout(v));

    this.load.on(Phaser.Loader.Events.PROGRESS, (value: number) => {
      this.loadProgress = value;
    });
    this.hasWork = ASSET_FILES.some((file) => !file.boot);
    this.barBg.setVisible(this.hasWork);
    this.barFill.setVisible(this.hasWork);
    for (const file of ASSET_FILES) {
      if (!file.boot) queueAssetFile(this, file);
    }
  }

  private layout(v: Viewport): void {
    const s = v.safe;
    if (v.orientation === 'landscape') {
      // Logo and tagline on the left, trailer, bar and prompt on the right.
      const lx = s.x + 470;
      const rx = s.x + 1360;
      this.logo.setPosition(lx, s.y + 450).setDisplaySize(620, 620);
      this.subtitle.setPosition(lx, s.y + 820);
      this.truck.setPosition(rx, s.y + 430).setScale(0.85);
      this.barBg.setPosition(rx, s.y + 830);
      this.barFill.setPosition(rx - BAR_WIDTH / 2, s.y + 830);
      this.prompt.setPosition(rx, s.y + 940);
    } else {
      const cx = v.width / 2;
      this.logo.setPosition(cx, s.y + 400).setDisplaySize(560, 560);
      this.subtitle.setPosition(cx, s.y + 730);
      this.truck.setPosition(cx, s.y + 1150).setScale(1);
      this.barBg.setPosition(cx, s.y + 1560);
      this.barFill.setPosition(cx - BAR_WIDTH / 2, s.y + 1560);
      this.prompt.setPosition(cx, s.y + 1700);
    }
  }

  create(): void {
    ensurePlaceholderTextures(this);
    this.loadProgress = 1;
  }

  override update(_time: number, delta: number): void {
    if (this.ready) return;
    if (!this.hasWork) {
      this.showPrompt();
      return;
    }
    this.elapsed += delta;
    const shown = Math.min(this.loadProgress, this.elapsed / MIN_SHOW_MS);
    this.barFill.scaleX = shown;
    if (shown >= 1) this.showPrompt();
  }

  private showPrompt(): void {
    this.ready = true;
    this.prompt.setVisible(true);
    this.tweens.add({ targets: this.prompt, alpha: 0.35, duration: 700, yoyo: true, repeat: -1 });
    this.input.once(Phaser.Input.Events.POINTER_DOWN, () => {
      if (save().data.tutorialDone) startMainGame(this);
      else this.scene.start(SceneKeys.Tutorial);
    });
  }
}
