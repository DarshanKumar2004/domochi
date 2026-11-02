import Phaser from 'phaser';
import { COLORS, CSS, FONT_FAMILY } from './theme';

const TRACK_W = 420;
const KNOB_R = 32;

/**
 * A volume slider: a label, a track you can tap or drag along, and the value
 * as a percentage. Big knob for a thumb. Calls `onChange` (0–1) as it moves,
 * and `onDone` once it's let go.
 */
export class Slider extends Phaser.GameObjects.Container {
  private readonly track: Phaser.GameObjects.Graphics;
  private readonly knob: Phaser.GameObjects.Arc;
  private readonly valueText: Phaser.GameObjects.Text;
  private value: number;

  constructor(
    scene: Phaser.Scene,
    label: string,
    value: number,
    private readonly onChange: (v: number) => void,
    private readonly onDone: () => void = () => undefined,
    name = '',
  ) {
    super(scene, 0, 0);
    this.value = value;
    const text = scene.add.text(-TRACK_W / 2 - 40, 0, label, { fontFamily: FONT_FAMILY, fontSize: '44px', fontStyle: 'bold', color: CSS.ink }).setOrigin(1, 0.5);
    this.track = scene.add.graphics();
    this.knob = scene.add.circle(0, 0, KNOB_R, COLORS.pink).setStrokeStyle(5, COLORS.ink);
    this.valueText = scene.add.text(TRACK_W / 2 + 30, 0, '', { fontFamily: FONT_FAMILY, fontSize: '36px', color: CSS.ink }).setOrigin(0, 0.5);
    // One generous hit area over the whole track: tap anywhere or drag.
    const hit = scene.add.zone(0, 0, TRACK_W + KNOB_R * 2, KNOB_R * 3).setInteractive({ useHandCursor: true, draggable: true }).setName(name);
    // Where the finger is along the track, measured on screen (the slider sits in a scaled card).
    const fromPointer = (p: Phaser.Input.Pointer) => {
      const b = hit.getBounds();
      const along = ((p.worldX - b.x) / b.width) * (TRACK_W + KNOB_R * 2) - KNOB_R;
      this.set(along / TRACK_W);
    };
    hit.on(Phaser.Input.Events.POINTER_DOWN, fromPointer);
    hit.on(Phaser.Input.Events.DRAG, fromPointer);
    hit.on(Phaser.Input.Events.POINTER_UP, () => this.onDone());
    hit.on(Phaser.Input.Events.DRAG_END, () => this.onDone());
    this.add([text, this.track, hit, this.knob, this.valueText]);
    scene.add.existing(this);
    this.draw();
  }

  private set(v: number): void {
    const next = Math.round(Math.max(0, Math.min(1, v)) * 20) / 20; // steps of 5%
    if (next === this.value) return;
    this.value = next;
    this.draw();
    this.onChange(next);
  }

  private draw(): void {
    const g = this.track;
    g.clear();
    g.fillStyle(0xd9cfc2);
    g.fillRoundedRect(-TRACK_W / 2, -10, TRACK_W, 20, 10);
    g.fillStyle(COLORS.pink);
    g.fillRoundedRect(-TRACK_W / 2, -10, Math.max(20, TRACK_W * this.value), 20, 10);
    g.lineStyle(3, COLORS.ink, 0.6);
    g.strokeRoundedRect(-TRACK_W / 2, -10, TRACK_W, 20, 10);
    this.knob.setX(-TRACK_W / 2 + TRACK_W * this.value);
    this.valueText.setText(this.value === 0 ? 'off' : `${Math.round(this.value * 100)}%`);
  }
}
