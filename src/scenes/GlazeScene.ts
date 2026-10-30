import Phaser from 'phaser';
import { TextureKeys } from '../assets/keys';
import { fryColor } from '../stations/fry';
import { glazeVerdict, type GlazeJob } from '../stations/glaze';
import { ringBallCenters, ringBallRadius } from '../stations/donutGeometry';
import type { Glaze } from '../systems/menu';
import { flavorsForDay } from '../systems/menu';
import { balance, menu, session } from '../systems/services';
import { Button } from '../ui/Button';
import { hexToNumber } from '../ui/DonutIcon';
import type { Viewport } from '../ui/layout';
import { COLORS, CSS, FONT_FAMILY } from '../ui/theme';
import { listen } from './listen';
import { SceneKeys } from './sceneKeys';
import { StationScene } from './StationScene';

/** Paint canvas resolution (px per side). */
const CANVAS = 420;
const CANVAS_KEY = 'glaze-paint';

interface BowlView {
  glaze: Glaze;
  container: Phaser.GameObjects.Container;
}

const LAYOUT = {
  portrait: {
    donut: { x: 540, y: 520, size: 600 },
    instruction: { x: 540, y: 870 },
    readout: { x: 540, y: 930 },
    bowls: { x: 540, y: 1075, cellW: 250, cellH: 210, perRow: 4, scale: 0.8 },
    buttons: { y: 1450, redoX: 300, doneX: 780, rackX: 540, scale: 1 },
  },
  landscape: {
    donut: { x: 500, y: 400, size: 560 },
    instruction: { x: 1440, y: 200 },
    readout: { x: 1440, y: 250 },
    bowls: { x: 1440, y: 380, cellW: 200, cellH: 165, perRow: 4, scale: 0.68 },
    buttons: { y: 712, redoX: 1250, doneX: 1630, rackX: 1440, scale: 0.88 },
  },
} as const;

export class GlazeScene extends StationScene {
  private donut!: Phaser.GameObjects.Image;
  private paint!: Phaser.GameObjects.Image;
  private canvas!: Phaser.Textures.CanvasTexture;
  private guides!: Phaser.GameObjects.Graphics;
  /** Ball outlines and gloss drawn over the paint, so a glazed donut still reads as 8 mochi bubbles. */
  private bubbles!: Phaser.GameObjects.Graphics;
  private paintZone!: Phaser.GameObjects.Zone;
  private instruction!: Phaser.GameObjects.Text;
  private readout!: Phaser.GameObjects.Text;
  private resultText!: Phaser.GameObjects.Text;
  private bowls: BowlView[] = [];
  private bowlHighlight!: Phaser.GameObjects.Graphics;
  private redoButton!: Button;
  private doneButton!: Button;
  private rackButton!: Button;

  private donutPos = { x: 0, y: 0, size: 1 };
  private bowlScale = 1;
  private painting = false;
  private lastX = 0;
  private lastY = 0;
  private dirty = false;
  /** Which job and donut the canvas currently shows (to know when to redraw it). */
  private shownJob: GlazeJob | undefined;
  private shownDonut = -1;
  private shownStep = -1;

  constructor() {
    super(SceneKeys.Glaze, 'Glaze Station', 0x6b4a5a, null);
  }

  protected override headerPosition(v: Viewport) {
    if (v.orientation === 'landscape') return { x: v.content.x + 1440, titleY: v.content.y + 55, subtitleY: v.content.y + 120 };
    return super.headerPosition(v);
  }

  protected buildStation(): void {
    this.bowls = [];
    this.shownJob = undefined;
    this.shownDonut = this.shownStep = -1;

    this.donut = this.add.image(0, 0, TextureKeys.DonutFry).setName('glaze-donut');
    if (this.textures.exists(CANVAS_KEY)) this.textures.remove(CANVAS_KEY);
    this.canvas = this.textures.createCanvas(CANVAS_KEY, CANVAS, CANVAS)!;
    this.paint = this.add.image(0, 0, CANVAS_KEY);
    this.bubbles = this.add.graphics();
    this.guides = this.add.graphics();
    this.paintZone = this.add.zone(0, 0, 1, 1).setInteractive({ useHandCursor: true }).setName('glaze-paint-zone');

    const text = (size: number, color: string, bold = false) =>
      this.add.text(0, 0, '', { fontFamily: FONT_FAMILY, fontSize: `${size}px`, fontStyle: bold ? 'bold' : 'normal', color, align: 'center' }).setOrigin(0.5);
    this.instruction = text(46, CSS.cream, true).setName('glaze-instruction');
    this.readout = text(36, CSS.muted);
    this.resultText = text(56, CSS.ink, true)
      .setBackgroundColor(CSS.cream)
      .setPadding(28, 18, 28, 18)
      .setDepth(20)
      .setVisible(false)
      .setName('glaze-result');

    // Bowls for every glaze used by today's flavors (base coats, then drizzles).
    const used = new Set(flavorsForDay(menu, session().day).flatMap((f) => [f.glaze, ...(f.drizzle ? [f.drizzle] : [])]));
    this.bowlHighlight = this.add.graphics().setDepth(1);
    for (const glaze of menu.glazes.filter((g) => used.has(g.id))) this.bowls.push(this.makeBowl(glaze));

    this.redoButton = new Button(this, 0, 0, 'Redo', () => this.redo(), { width: 300, fill: COLORS.dough, name: 'btn-glaze-redo' });
    this.doneButton = new Button(this, 0, 0, 'Done', () => this.done(), { width: 360, name: 'btn-glaze-done' });
    this.rackButton = new Button(this, 0, 0, 'grab from rack', () => this.grabFromRack(), { width: 520, name: 'btn-glaze-rack' });

    this.paintZone.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => this.startPaint(p));
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => this.movePaint(p));
    this.input.on(Phaser.Input.Events.POINTER_UP, () => (this.painting = false));
    this.events.on(Phaser.Scenes.Events.SLEEP, () => (this.painting = false));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.SLEEP);
      if (this.textures.exists(CANVAS_KEY)) this.textures.remove(CANVAS_KEY);
    });
    listen(this, session().events, 'changed', () => this.refresh());
  }

  private makeBowl(glaze: Glaze): BowlView {
    const bowl = new Phaser.GameObjects.Image(this, 0, 0, TextureKeys.GlazeBowl);
    // The bowl art's glaze surface sits 35 px above its centre; paint our own colour over it.
    const surface = this.add.ellipse(0, -35, 210, 50, hexToNumber(glaze.color)).setStrokeStyle(3, COLORS.ink, 0.4);
    const label = this.make
      .text(
        {
          x: 0,
          y: 120,
          text: glaze.name.replace(/ glaze$/, ''),
          style: { fontFamily: FONT_FAMILY, fontSize: '32px', color: CSS.cream, align: 'center', wordWrap: { width: 300 } },
        },
        false,
      )
      .setOrigin(0.5, 0);
    const container = this.add.container(0, 0, [bowl, surface, label]).setName(`bowl-${glaze.id}`);
    container.setSize(270, 200);
    container.setInteractive({ useHandCursor: true });
    container.on(Phaser.Input.Events.POINTER_DOWN, () => this.choose(glaze.id));
    return { glaze, container };
  }

  protected layoutStation(v: Viewport): void {
    const L = LAYOUT[v.orientation];
    const c = v.content;
    this.donutPos = { x: c.x + L.donut.x, y: c.y + L.donut.y, size: L.donut.size };
    const { x, y, size } = this.donutPos;
    // The donut art's ring fills ~95% of its texture; the glaze maths use the same normalised square.
    this.donut.setPosition(x, y).setDisplaySize(size, size);
    this.paint.setPosition(x, y).setDisplaySize(size, size);
    this.paintZone.setPosition(x, y).setSize(size, size);
    this.instruction.setPosition(c.x + L.instruction.x, c.y + L.instruction.y);
    this.readout.setPosition(c.x + L.readout.x, c.y + L.readout.y);
    this.resultText.setPosition(x, y);
    this.drawBubbles();

    this.bowlScale = L.bowls.scale;
    const n = this.bowls.length;
    const perRow = Math.min(L.bowls.perRow, n);
    this.bowls.forEach((b, i) => {
      const row = Math.floor(i / perRow);
      const inRow = Math.min(perRow, n - row * perRow);
      const col = i % perRow;
      b.container
        .setPosition(c.x + L.bowls.x + (col - (inRow - 1) / 2) * L.bowls.cellW, c.y + L.bowls.y + row * L.bowls.cellH)
        .setScale(L.bowls.scale);
    });

    this.redoButton.setPosition(c.x + L.buttons.redoX, c.y + L.buttons.y).setScale(L.buttons.scale);
    this.doneButton.setPosition(c.x + L.buttons.doneX, c.y + L.buttons.y).setScale(L.buttons.scale);
    this.rackButton.setPosition(c.x + L.buttons.rackX, c.y + L.buttons.y).setScale(L.buttons.scale);
    this.refresh();
  }

  // ---- State → screen ---------------------------------------------------------

  private refresh(): void {
    const s = session();
    const active = s.activeTicket;
    const job = s.activeGlazeJob;
    const step = job?.step;

    // Subtitle and instruction
    if (!active) {
      this.setSubtitle('no ticket selected');
      this.instruction.setText('tap a ticket on the rail');
    } else if (active.results.glaze) {
      this.setSubtitle(`#${active.no} glazed · score ${active.results.glaze.score}`);
      this.instruction.setText('all glazed! on to toppings');
    } else if (!active.results.fry) {
      this.setSubtitle(`#${active.no} · not fried yet`);
      this.instruction.setText(s.canUseRack ? 'grab its donuts from the rack' : 'fry its donuts first');
    } else if (job && step) {
      const name = menu.flavors.find((f) => f.id === step.flavorId)?.name ?? step.flavorId;
      const donuts = active.order.flavors.length;
      this.setSubtitle(`#${active.no} · donut ${step.donutIndex + 1} of ${donuts}`);
      const what = step.kind === 'drizzle' ? 'now drizzle it' : step.style === 'dust' ? 'dust it' : 'glaze it';
      this.instruction.setText(`${name}: ${what}`);
    }

    const working = !!job && !!step;
    this.donut.setVisible(working);
    this.paint.setVisible(working);
    this.bubbles.setVisible(working);
    this.bowls.forEach((b) => b.container.setVisible(working));
    this.redoButton.setVisible(working);
    this.doneButton.setVisible(working);
    this.rackButton.setVisible(!!active && !active.results.fry && s.canUseRack);
    this.readout.setVisible(working);

    if (job && step) {
      const fried = active?.results.fry?.donuts[step.donutIndex];
      this.donut.setTint(fried ? fryColor((fried.a + fried.b) / 2) : fryColor(1));
      if (job !== this.shownJob || step.donutIndex !== this.shownDonut || job.stepIndex !== this.shownStep) {
        this.shownJob = job;
        this.shownDonut = step.donutIndex;
        this.shownStep = job.stepIndex;
        this.redrawCanvas(job);
        this.drawGuides(job);
      }
    } else {
      this.guides.clear();
    }
    this.refreshControls();
  }

  /** Buttons, bowl highlight and readout: cheap, called after every stroke. */
  private refreshControls(): void {
    const job = session().activeGlazeJob;
    this.bowlHighlight.clear();
    if (!job) return;
    this.redoButton.setEnabled(job.hasPaint);
    this.doneButton.setEnabled(!!job.chosen && job.hasPaint);
    const chosen = this.bowls.find((b) => b.glaze.id === job.chosen);
    if (chosen) {
      const { x, y } = chosen.container;
      this.bowlHighlight.lineStyle(8, COLORS.pink);
      this.bowlHighlight.strokeRoundedRect(x - 160 * this.bowlScale, y - 110 * this.bowlScale, 320 * this.bowlScale, 300 * this.bowlScale, 24);
    }
    this.readout.setText(
      job.chosen ? `coverage ${Math.round(job.coverage * 100)}% · spill ${Math.round(job.spill * 100)}%` : 'pick a glaze, then paint with your finger',
    );
  }

  // ---- Painting ---------------------------------------------------------------

  private toNorm(p: Phaser.Input.Pointer): { x: number; y: number } {
    const { x, y, size } = this.donutPos;
    return { x: (p.worldX - x) / (size / 2), y: (p.worldY - y) / (size / 2) };
  }

  private startPaint(p: Phaser.Input.Pointer): void {
    const job = session().activeGlazeJob;
    if (!job?.step) return;
    if (!job.chosen) {
      this.flash('pick a glaze first!');
      return;
    }
    const n = this.toNorm(p);
    this.painting = true;
    this.lastX = n.x;
    this.lastY = n.y;
    this.paintSegment(job, n.x, n.y, n.x, n.y);
  }

  private movePaint(p: Phaser.Input.Pointer): void {
    if (!this.painting || !p.isDown) return;
    const job = session().activeGlazeJob;
    if (!job?.chosen) return;
    const n = this.toNorm(p);
    this.paintSegment(job, this.lastX, this.lastY, n.x, n.y);
    this.lastX = n.x;
    this.lastY = n.y;
  }

  private paintSegment(job: GlazeJob, x0: number, y0: number, x1: number, y1: number): void {
    if (!job.chosen || !job.paint(x0, y0, x1, y1)) return;
    this.drawSegment(job.chosen, x0, y0, x1, y1, job.strokes.length / 4);
    this.dirty = true;
  }

  override update(): void {
    // Upload the canvas to the GPU at most once a frame, however many strokes came in.
    if (this.dirty) {
      this.dirty = false;
      this.canvas.refresh();
      this.refreshControls();
    }
  }

  /** Draw one stroke segment onto the canvas in a glaze's style. */
  private drawSegment(glazeId: string, x0: number, y0: number, x1: number, y1: number, seed: number): void {
    const g = menu.glazes.find((x) => x.id === glazeId);
    if (!g) return;
    const job = session().activeGlazeJob;
    const r = (job?.brushFor(glazeId) ?? 0.1) * (CANVAS / 2);
    const px = (v: number) => (v + 1) * (CANVAS / 2);
    const ctx = this.canvas.context;
    if (g.style === 'dust') {
      // Powdered sugar: a scatter of soft white specks (deterministic, so redraws match).
      let s = (seed * 9301 + 49297) % 233280;
      const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
      const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * (CANVAS / 2) / (r * 0.5)));
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        const cx = px(x0 + (x1 - x0) * t);
        const cy = px(y0 + (y1 - y0) * t);
        for (let d = 0; d < 14; d++) {
          const a = rnd() * Math.PI * 2;
          const dist = Math.sqrt(rnd()) * r;
          ctx.beginPath();
          ctx.arc(cx + Math.cos(a) * dist, cy + Math.sin(a) * dist, 2 + rnd() * 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      return;
    }
    ctx.strokeStyle = g.color;
    ctx.fillStyle = g.color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = r * 2;
    ctx.beginPath();
    ctx.moveTo(px(x0), px(y0));
    ctx.lineTo(px(x1), px(y1) + 0.01);
    ctx.stroke();
  }

  /** Redraw the current donut: its finished layers, then the layer in progress. */
  private redrawCanvas(job: GlazeJob): void {
    this.canvas.context.clearRect(0, 0, CANVAS, CANVAS);
    const step = job.step;
    if (step) {
      let seed = 0;
      for (const layer of job.layersFor(step.donutIndex)) {
        for (let k = 0; k < layer.strokes.length; k += 4) {
          this.drawSegment(layer.usedGlazeId, layer.strokes[k]!, layer.strokes[k + 1]!, layer.strokes[k + 2]!, layer.strokes[k + 3]!, ++seed);
        }
      }
      if (job.chosen) {
        for (let k = 0; k < job.strokes.length; k += 4) {
          this.drawSegment(job.chosen, job.strokes[k]!, job.strokes[k + 1]!, job.strokes[k + 2]!, job.strokes[k + 3]!, k / 4 + 1);
        }
      }
    }
    this.canvas.refresh();
  }

  /** Outline and a little gloss on each of the 8 balls (same geometry as the glaze maths). */
  private drawBubbles(): void {
    const { x, y, size } = this.donutPos;
    const half = size / 2;
    const gb = balance.glaze;
    const r = ringBallRadius(gb.ringRadius, 8, gb.ballOverlap) * half;
    const g = this.bubbles;
    g.clear();
    for (const p of ringBallCenters(0, 0, gb.ringRadius)) {
      const cx = x + p.x * half;
      const cy = y + p.y * half;
      g.lineStyle(5, COLORS.ink, 0.35);
      g.strokeCircle(cx, cy, r);
      g.lineStyle(8, 0xffffff, 0.35);
      g.beginPath();
      g.arc(cx, cy, r * 0.62, Math.PI * 1.08, Math.PI * 1.42);
      g.strokePath();
    }
  }

  /** Dashed guide lines for drizzle steps. */
  private drawGuides(job: GlazeJob): void {
    this.guides.clear();
    const { x, y, size } = this.donutPos;
    const half = size / 2;
    this.guides.lineStyle(6, 0xffffff, 0.55);
    for (const g of job.guides) {
      const dashes = 14;
      for (let k = 0; k < dashes; k += 2) {
        const t0 = k / dashes;
        const t1 = (k + 1) / dashes;
        this.guides.lineBetween(
          x + (g.x0 + (g.x1 - g.x0) * t0) * half * 0.9,
          y + (g.y0 + (g.y1 - g.y0) * t0) * half * 0.9,
          x + (g.x0 + (g.x1 - g.x0) * t1) * half * 0.9,
          y + (g.y0 + (g.y1 - g.y0) * t1) * half * 0.9,
        );
      }
    }
  }

  // ---- Actions ----------------------------------------------------------------

  private choose(glazeId: string): void {
    const job = session().activeGlazeJob;
    if (!job?.step) return;
    const hadPaint = job.hasPaint && job.chosen !== glazeId;
    job.choose(glazeId);
    if (hadPaint) this.redrawCanvas(job);
    this.refreshControls();
  }

  private redo(): void {
    const job = session().activeGlazeJob;
    if (!job) return;
    job.redo();
    this.redrawCanvas(job);
    this.refreshControls();
  }

  private done(): void {
    const s = session();
    const ticket = s.activeTicket;
    const job = s.activeGlazeJob;
    if (!job?.chosen || !job.hasPaint || !ticket) return;
    const layer = s.finishGlazeLayer();
    const finished = ticket.results.glaze;
    if (finished) {
      this.flash(`#${ticket.no}  glaze ${finished.score}\n${glazeVerdict(finished.score)}`, 2000);
    } else {
      this.flash(`${Math.round(layer.score * 100)}%`, 700);
    }
  }

  private grabFromRack(): void {
    const s = session();
    if (s.canUseRack) s.useRack();
  }

  private flash(text: string, hold = 1000): void {
    this.tweens.killTweensOf(this.resultText);
    this.resultText.setText(text).setVisible(true).setAlpha(1);
    this.tweens.add({ targets: this.resultText, alpha: 0, delay: hold, duration: 400, onComplete: () => this.resultText.setVisible(false) });
  }
}
