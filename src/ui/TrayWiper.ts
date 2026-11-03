import Phaser from 'phaser';
import { TextureKeys } from '../assets/keys';
import { audio, balance, session } from '../systems/services';
import { MESS_SIZE, TRAY_PAD } from './donutArt';
import { roundBg } from './roundBg';
import { FONT_FAMILY } from './theme';

/**
 * Scrubbing a tray with a sponge (Glaze and Toppings stations): press on the
 * empty tray and drag. The mess under the sponge is wiped off the tray's mess
 * canvas, and the session's mess count goes down; once it's clean, the tray
 * is cleared completely.
 */
export class TrayWiper {
  private readonly sponge: Phaser.GameObjects.Image;
  /** The sponge sitting on the tray's corner when it's messy: tap to pick it up. */
  private readonly icon: Phaser.GameObjects.Image;
  private readonly iconLabel: Phaser.GameObjects.Text;
  /** Picked up: the next press on the tray scrubs (whatever cup or jar was in hand). */
  holding = false;
  private pointer: Phaser.Input.Pointer | null = null;
  private lastX = 0;
  private lastY = 0;
  private nextSound = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly tray: 'glaze' | 'toppings',
    /** The tray's mess canvases, one per donut spot. */
    private readonly mess: () => readonly Phaser.Textures.CanvasTexture[],
    /** Each spot: centre and donut size (its mess canvas is a little bigger). */
    private readonly boards: () => readonly { x: number; y: number; size: number }[],
    private readonly onClean: () => void,
    /** Picking the sponge up (the station puts its cup or jar down). */
    private readonly onPick: () => void = () => undefined,
  ) {
    this.sponge = scene.add.image(0, 0, TextureKeys.Sponge).setDepth(22).setVisible(false).setName(`sponge-${tray}`);
    this.icon = scene.add.image(0, 0, TextureKeys.Sponge).setDepth(18).setVisible(false).setName(`sponge-pick-${tray}`).setInteractive({ useHandCursor: true });
    this.iconLabel = roundBg(scene.add
      .text(0, 0, 'tap to clean', { fontFamily: FONT_FAMILY, fontSize: '28px', fontStyle: 'bold', color: '#fbf6ec', backgroundColor: '#1f1a17cc', padding: { x: 8, y: 3 } })
      .setOrigin(0.5, 0)
      .setDepth(18)
      .setVisible(false), 0x1f1a17, 0.8, 10);
    this.icon.on(Phaser.Input.Events.POINTER_UP, () => {
      this.holding = !this.holding;
      if (this.holding) this.onPick();
      audio().play('tap');
      this.refreshIcon();
    });
    scene.tweens.add({ targets: this.icon, angle: { from: -6, to: 6 }, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
  }

  /** Put the sponge icon on the tray's corner. */
  placeIcon(x: number, y: number, scale = 1): void {
    this.icon.setPosition(x, y).setScale(scale);
    this.iconLabel.setPosition(x, y + 40 * scale).setScale(scale);
    this.refreshIcon();
  }

  /** Always there, so you can scrub any time; faded while the tray's already clean, lit up when picked. */
  refreshIcon(): void {
    this.icon.setVisible(true).setAlpha(this.holding ? 1 : this.dirty ? 0.9 : 0.5);
    this.iconLabel.setVisible(true).setText(this.holding ? 'scrub the tray!' : this.dirty ? 'tap to clean' : 'sponge');
    if (this.holding) this.icon.setTint(0xfff2a8);
    else this.icon.clearTint();
  }

  get active(): boolean {
    return this.pointer !== null;
  }

  /** Is there mess worth wiping? */
  get dirty(): boolean {
    return session().messOn(this.tray) > 0;
  }

  start(p: Phaser.Input.Pointer): void {
    this.pointer = p;
    this.lastX = p.x;
    this.lastY = p.y;
    this.sponge.setVisible(true).setPosition(p.x, p.y);
  }

  stop(): void {
    this.pointer = null;
    this.sponge.setVisible(false);
  }

  /** Call every frame. */
  update(time: number): void {
    const p = this.pointer;
    if (!p) return;
    if (!p.isDown) {
      this.stop();
      return;
    }
    this.sponge.setPosition(p.x, p.y).setAngle(Math.sin(time / 60) * 6);
    const dx = p.x - this.lastX;
    const dy = p.y - this.lastY;
    if (dx === 0 && dy === 0) return;
    const b = this.boards()[0]!;
    const dist = Math.hypot(dx, dy) / (b.size / 2); // in donut-normalised units
    this.erase(this.lastX, this.lastY, p.x, p.y);
    this.lastX = p.x;
    this.lastY = p.y;
    if (time >= this.nextSound) {
      this.nextSound = time + 180;
      audio().play('scrub');
    }
    // Wiping goes faster the messier it is, so a big spill doesn't take forever.
    const s = session();
    const m = s.messOn(this.tray);
    if (s.wipe(this.tray, dist / balance.cleanup.wipePerUnit + m * dist * 0.5) && m > 0) {
      this.clearAll();
      this.holding = false;
      this.refreshIcon();
      this.onClean();
    }
  }

  /** Rub the mess off every spot's canvas along the sponge's path. */
  private erase(x0: number, y0: number, x1: number, y1: number): void {
    const boards = this.boards();
    this.mess().forEach((tex, i) => {
      const b = boards[i];
      if (!b) return;
      const span = b.size * (1 + 2 * TRAY_PAD);
      const k = MESS_SIZE / span;
      const toCanvas = (x: number, y: number) => [(x - (b.x - span / 2)) * k, (y - (b.y - span / 2)) * k] as const;
      const [ax, ay] = toCanvas(x0, y0);
      const [bx, by] = toCanvas(x1, y1);
      const ctx = tex.context;
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineCap = 'round';
      ctx.lineWidth = MESS_SIZE * 0.2;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx + 0.01, by);
      ctx.stroke();
      ctx.restore();
      tex.refresh();
    });
  }

  private clearAll(): void {
    for (const tex of this.mess()) {
      tex.context.clearRect(0, 0, MESS_SIZE, MESS_SIZE);
      tex.refresh();
    }
  }
}
