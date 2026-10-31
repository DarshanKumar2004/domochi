import Phaser from 'phaser';
import { TextureKeys } from '../assets/keys';
import { audio, balance, session } from '../systems/services';
import { MESS_SIZE, TRAY_PAD } from './donutArt';

/**
 * Scrubbing a tray with a sponge (Glaze and Toppings stations): press on the
 * empty tray and drag. The mess under the sponge is wiped off the tray's mess
 * canvas, and the session's mess count goes down; once it's clean, the tray
 * is cleared completely.
 */
export class TrayWiper {
  private readonly sponge: Phaser.GameObjects.Image;
  private pointer: Phaser.Input.Pointer | null = null;
  private lastX = 0;
  private lastY = 0;
  private nextSound = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly tray: 'glaze' | 'toppings',
    private readonly mess: () => Phaser.Textures.CanvasTexture,
    /** The board: centre and donut size (the tray is a little bigger). */
    private readonly board: () => { x: number; y: number; size: number },
    private readonly onClean: () => void,
  ) {
    this.sponge = scene.add.image(0, 0, TextureKeys.Sponge).setDepth(22).setVisible(false).setName(`sponge-${tray}`);
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
    const b = this.board();
    const dist = Math.hypot(dx, dy) / (b.size / 2); // in donut-normalised units
    this.erase(this.lastX, this.lastY, p.x, p.y);
    this.lastX = p.x;
    this.lastY = p.y;
    if (time >= this.nextSound) {
      this.nextSound = time + 180;
      audio().play('shake');
    }
    // Wiping goes faster the messier it is, so a big spill doesn't take forever.
    const s = session();
    const m = s.messOn(this.tray);
    if (s.wipe(this.tray, dist / balance.cleanup.wipePerUnit + m * dist * 0.5) && m > 0) {
      this.clearAll();
      this.onClean();
    }
  }

  /** Rub the mess off the canvas along the sponge's path. */
  private erase(x0: number, y0: number, x1: number, y1: number): void {
    const b = this.board();
    const span = b.size * (1 + 2 * TRAY_PAD);
    const k = MESS_SIZE / span;
    const toCanvas = (x: number, y: number) => [(x - (b.x - span / 2)) * k, (y - (b.y - span / 2)) * k] as const;
    const [ax, ay] = toCanvas(x0, y0);
    const [bx, by] = toCanvas(x1, y1);
    const tex = this.mess();
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
  }

  private clearAll(): void {
    const tex = this.mess();
    tex.context.clearRect(0, 0, MESS_SIZE, MESS_SIZE);
    tex.refresh();
  }
}
