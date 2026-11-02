import Phaser from 'phaser';
import type { FeedbackKind } from '../systems/FeedbackService';
import { Button } from '../ui/Button';
import { panelOpen, showAbout, showFeedback, showTrailerWord } from '../ui/HomePanels';
import { ASSET_FILES, queueAssetFile } from '../assets/files';
import brand from '../data/brand.json';
import { TextureKeys } from '../assets/keys';
import { ensurePlaceholderTextures } from '../assets/placeholders';
import { audio, feedback, menu, save, claimTrailerWord, setNews } from '../systems/services';
import type { Viewport } from '../ui/layout';
import { COLORS, CSS, FONT_FAMILY } from '../ui/theme';
import { Truck } from '../ui/Truck';
import { addDonutIcon } from '../ui/DonutIcon';
import { getViewport, onLayout } from '../ui/viewport';
import { startMainGame } from './flow';
import { activeNews } from '../systems/news';
import { roundBg } from '../ui/roundBg';
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
  /** News from the real trailer (public/news.json), when there is some. */
  private news!: Phaser.GameObjects.Text;
  private truck!: Truck;
  private barBg!: Phaser.GameObjects.Rectangle;
  private barFill!: Phaser.GameObjects.Rectangle;
  private prompt!: Phaser.GameObjects.Text;
  private soundHint!: Phaser.GameObjects.Text;
  private footer!: Phaser.GameObjects.Text;
  /** Donuts of every flavour drifting up behind everything. */
  private floaters: { img: Phaser.GameObjects.Image; speed: number; sway: number; phase: number }[] = [];
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
    this.floaters = [];
    this.logo = this.add.image(0, 0, TextureKeys.Logo).setDepth(2);
    this.subtitle = this.add
      .text(0, 0, brand.tagline, { fontFamily: FONT_FAMILY, fontSize: '48px', color: CSS.ink })
      .setOrigin(0.5)
      .setDepth(2);
    this.footer = this.add
      .text(0, 0, `${brand.instagram}  ·  ${brand.website.replace(/^https?:\/\/(www\.)?/, '')}`, { fontFamily: FONT_FAMILY, fontSize: '34px', color: '#6b5d52' })
      .setOrigin(0.5)
      .setDepth(2);
    this.soundHint = this.add
      .text(0, 0, 'best with sound on', { fontFamily: FONT_FAMILY, fontSize: '32px', color: '#6b5d52' })
      .setOrigin(0.5)
      .setDepth(2)
      .setVisible(false);
    this.news = roundBg(
      this.add
        .text(0, 0, '', { fontFamily: FONT_FAMILY, fontSize: '34px', fontStyle: 'bold', color: '#fffaf0', align: 'center', wordWrap: { width: 760 }, padding: { x: 22, y: 12 } })
        .setOrigin(0.5)
        .setDepth(4)
        .setVisible(false)
        .setName('home-news'),
      0xb0406a,
    );
    this.loadNews();
    this.truck = new Truck(this, 0, 0);
    this.barBg = this.add.rectangle(0, 0, BAR_WIDTH + 16, BAR_HEIGHT + 16, 0xe6e1d6);
    this.barFill = this.add.rectangle(0, 0, BAR_WIDTH, BAR_HEIGHT, COLORS.pink).setOrigin(0, 0.5).setScale(0, 1);
    this.prompt = this.add
      .text(0, 0, 'Tap to start', { fontFamily: FONT_FAMILY, fontSize: '72px', fontStyle: 'bold', color: CSS.ink })
      .setOrigin(0.5)
      .setName('prompt-start')
      .setDepth(2)
      .setVisible(false);
    this.makeHomeButtons();
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

  private logoY = 0;

  private layout(v: Viewport): void {
    const s = v.safe;
    if (v.orientation === 'landscape') {
      // Logo and tagline on the left, trailer, bar and prompt on the right.
      const lx = s.x + 470;
      const rx = s.x + 1360;
      this.logo.setPosition(lx, s.y + 450).setDisplaySize(620, 620);
      this.subtitle.setPosition(lx, s.y + 820);
      this.news.setPosition(rx, s.y + 95);
      this.truck.setPosition(rx, s.y + 430).setScale(0.85);
      // Three under the trailer; the secret word under the logo.
      this.homeButtons.forEach((b, i) => (i < 3 ? b.setPosition(rx + (i - 1) * 335, s.y + 830).setScale(0.84) : b.setPosition(lx, s.y + 985).setScale(0.84)));
      this.barBg.setPosition(rx, s.y + 830);
      this.barFill.setPosition(rx - BAR_WIDTH / 2, s.y + 830);
      this.prompt.setPosition(rx, s.y + 940);
      this.soundHint.setPosition(rx, s.y + 1010);
      this.footer.setPosition(lx, s.y + 900);
    } else {
      const cx = v.width / 2;
      this.logo.setPosition(cx, s.y + 400).setDisplaySize(560, 560);
      this.subtitle.setPosition(cx, s.y + 730);
      this.news.setPosition(cx, s.y + 815);
      this.truck.setPosition(cx, s.y + 1150).setScale(1);
      // Four across (a little smaller).
      this.homeButtons.forEach((b, i) => b.setPosition(cx + (i - 1.5) * 262, s.y + 1560).setScale(0.7));
      this.barBg.setPosition(cx, s.y + 1560);
      this.barFill.setPosition(cx - BAR_WIDTH / 2, s.y + 1560);
      this.prompt.setPosition(cx, s.y + 1700);
      this.soundHint.setPosition(cx, s.y + 1775);
      this.footer.setPosition(cx, s.y + 1860);
    }
    this.logoY = this.logo.y;
  }

  create(): void {
    ensurePlaceholderTextures(this);
    this.loadProgress = 1;
    this.addFloaters();
    // The logo pops in.
    const sx = this.logo.scaleX;
    const sy = this.logo.scaleY;
    this.logo.setScale(sx * 0.7, sy * 0.7).setAlpha(0);
    this.tweens.add({ targets: this.logo, scaleX: sx, scaleY: sy, alpha: 1, duration: 600, ease: 'Back.Out' });
  }

  /** A dozen donuts (every flavour) drifting slowly up behind the logo and trailer. */
  private addFloaters(): void {
    const v = getViewport(this);
    for (let i = 0; i < 12; i++) {
      const flavor = menu.flavors[i % menu.flavors.length]!;
      const size = 90 + ((i * 37) % 60);
      const img = addDonutIcon(this, ((i * 0.37) % 1) * v.width, ((i * 0.61) % 1) * v.height, size, flavor.id, menu)
        .setAlpha(0.28)
        .setDepth(-1); // behind the logo and the trailer
      this.add.existing(img);
      this.floaters.push({ img, speed: 18 + ((i * 13) % 20), sway: 20 + ((i * 7) % 25), phase: i });
    }
  }

  override update(time: number, delta: number): void {
    // Drifting donuts wrap round from top to bottom; the logo bobs gently.
    const v = getViewport(this);
    for (const f of this.floaters) {
      f.img.y -= (f.speed * delta) / 1000;
      if (f.img.y < -100) f.img.y = v.height + 100;
      f.img.x += Math.sin(time / 1500 + f.phase) * f.sway * (delta / 1000);
      f.img.rotation += 0.0002 * delta;
    }
    if (this.logo.alpha === 1) this.logo.y = this.logoY + Math.sin(time / 900) * 8;
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
    this.soundHint.setVisible(true);
    // The home screen: about us, and notes for Ethan. Tapping anywhere else starts the game.
    this.barBg.setVisible(false);
    this.barFill.setVisible(false);
    for (const b of this.homeButtons) b.setVisible(true);
    this.tweens.add({ targets: this.prompt, alpha: 0.35, duration: 700, yoyo: true, repeat: -1 });
    let started = false;
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (_p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (started || panelOpen() || over.some((o) => this.homeButtons.includes(o as Button))) return;
      started = true;
      audio().unlock(); // browsers allow sound only after a tap
      startMainGame(this, { tutorial: !save().data.tutorialDone });
    });
  }

  /** News from the trailer, read fresh from the game's website (no app update needed to change it). */
  private loadNews(): void {
    const url = (brand as { newsUrl?: string }).newsUrl;
    if (!url || typeof fetch !== 'function') return;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 4000);
    fetch(url, { cache: 'no-store', signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((json: unknown) => {
        setNews(json);
        const msg = activeNews(json, new Date());
        if (msg && this.news?.active) this.news.setText(`📍 ${msg}`).setVisible(true);
      })
      .catch(() => undefined) // offline: no news, no fuss
      .finally(() => clearTimeout(timer));
  }

  private homeButtons: Button[] = [];

  /** About us, suggest a flavour, a note for Ethan: shown once loading's done. */
  private makeHomeButtons(): void {
    const opts = (name: string) => ({ width: 320, height: 120, fontSize: 34, fill: COLORS.dough, name });
    // A note goes out as soon as it's sent (if that fails, it waits for the end of the day or the next visit).
    const thanks = (kind: FeedbackKind) => (text: string, name: string) => {
      const kept = feedback().add(kind, text, name);
      if (kept) void feedback().sendReport(save().data.day);
      return kept;
    };
    this.homeButtons = [
      new Button(this, 0, 0, 'About us', () => showAbout(), opts('btn-about')),
      new Button(this, 0, 0, 'Suggest a flavor', () => showFeedback('flavor', thanks('flavor')), { ...opts('btn-suggest'), fontSize: 30 }),
      new Button(this, 0, 0, 'Let Ethan know', () => showFeedback('note', thanks('note')), { ...opts('btn-tell-ethan'), fontSize: 30 }),
      // The real trailer's weekly secret word: a treat for visiting.
      new Button(this, 0, 0, 'Secret word', () => showTrailerWord((w) => claimTrailerWord(w)), { ...opts('btn-secret-word'), fill: COLORS.pink, fontSize: 30 }),
    ];
    for (const b of this.homeButtons) b.setDepth(3).setVisible(false);
  }
}
