import Phaser from 'phaser';
import { TextureKeys } from '../assets/keys';
import { doughVerdict } from '../stations/dough';
import { audio, balance, session } from '../systems/services';
import { Button } from '../ui/Button';
import { hexToNumber } from '../ui/DonutIcon';
import type { Viewport } from '../ui/layout';
import { COLORS, CSS, FONT_FAMILY } from '../ui/theme';
import { listen } from './listen';
import { SceneKeys } from './sceneKeys';
import { roundBg } from '../ui/roundBg';
import { StationScene } from './StationScene';
import { popScore } from '../ui/popText';

/** The bowl texture's opening, relative to its centre (see MANIFEST: ellipse at (180, 70) of 360×250). */
const OPENING = { dy: -55, rx: 150, ry: 36 };
/** Lumps in an unstirred batch (they fade as you stir). */
const LUMPS = 16;

const LAYOUT = {
  portrait: {
    tub: { x: 540, y: 255 },
    bowl: { x: 540, y: 640, scale: 1.6 },
    instruction: { x: 540, y: 905 },
    readout: { x: 540, y: 955 },
    bins: { x: 540, y: 1100, step: 205, scale: 0.62 },
    recipe: { x: 540, y: 1285 },
    buttons: { y: 1440, redoX: 270, doneX: 790, scale: 1 },
  },
  landscape: {
    tub: { x: 1440, y: 170 },
    bowl: { x: 480, y: 330, scale: 1.3 },
    instruction: { x: 480, y: 610 },
    readout: { x: 480, y: 660 },
    bins: { x: 1440, y: 330, step: 180, scale: 0.55 },
    recipe: { x: 1440, y: 500 },
    buttons: { y: 690, redoX: 1250, doneX: 1630, scale: 0.85 },
  },
} as const;

interface BinView {
  id: string;
  img: Phaser.GameObjects.Image;
  name: Phaser.GameObjects.Text;
  count: Phaser.GameObjects.Text;
}

/**
 * Morning prep (and a second batch whenever you run low): scoop the recipe
 * into the bowl, stir it smooth, and tip it into the tub. The fryer can't
 * drop a donut without dough.
 */
export class DoughScene extends StationScene {
  private bowl!: Phaser.GameObjects.Image;
  private contents!: Phaser.GameObjects.Graphics;
  private bowlZone!: Phaser.GameObjects.Zone;
  private spoon!: Phaser.GameObjects.Graphics;
  private bins: BinView[] = [];
  private tubText!: Phaser.GameObjects.Text;
  private tubBar!: Phaser.GameObjects.Graphics;
  private instruction!: Phaser.GameObjects.Text;
  private readout!: Phaser.GameObjects.Text;
  private recipe!: Phaser.GameObjects.Text;
  private flashText!: Phaser.GameObjects.Text;
  private redoButton!: Button;
  private doneButton!: Button;

  private bowlPos = { x: 0, y: 0, scale: 1 };
  private tubPos = { x: 0, y: 0 };
  private stirPointer: Phaser.Input.Pointer | null = null;
  private lastAngle = 0;
  private nextStirSound = 0;
  /** Scrubbing the empty bowl (not stirring a batch). */
  private washing = false;
  /** The sponge by the bowl (always there; bright when the bowl needs a wash). */
  private sponge!: Phaser.GameObjects.Image;
  private spongeLabel!: Phaser.GameObjects.Text;
  /** Lump positions in the bowl (normalised to the opening), fixed per scene. */
  private readonly lumps: { x: number; y: number; r: number }[] = [];

  constructor() {
    super(SceneKeys.Dough, 'Dough Station', 0x6b5a4a, null);
  }

  protected override headerPosition(v: Viewport) {
    if (v.orientation === 'landscape') return { x: v.content.x + 1440, titleY: v.content.y + 45, subtitleY: v.content.y + 100 };
    return super.headerPosition(v);
  }

  protected buildStation(): void {
    this.bins = [];
    this.stirPointer = null;
    this.lumps.length = 0;
    for (let i = 0; i < LUMPS; i++) {
      const a = (i * 2.399) % (Math.PI * 2);
      const d = Math.sqrt(((i * 0.618) % 1) * 0.8);
      this.lumps.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r: 0.05 + ((i * 0.37) % 1) * 0.05 });
    }

    const text = (size: number, color: string, bold = false) =>
      this.add.text(0, 0, '', { fontFamily: FONT_FAMILY, fontSize: `${size}px`, fontStyle: bold ? 'bold' : 'normal', color, align: 'center' }).setOrigin(0.5);
    this.tubBar = this.add.graphics();
    this.tubText = text(38, CSS.cream, true).setName('dough-tub');
    this.bowl = this.add.image(0, 0, TextureKeys.MixingBowl).setName('dough-bowl');
    this.contents = this.add.graphics();
    this.spoon = this.add.graphics().setDepth(10).setVisible(false);
    this.bowlZone = this.add.zone(0, 0, 1, 1).setInteractive({ useHandCursor: true }).setName('dough-stir');
    this.sponge = this.add.image(0, 0, TextureKeys.Sponge).setName('dough-sponge').setInteractive({ useHandCursor: true });
    this.spongeLabel = roundBg(this.add
      .text(0, 0, '', { fontFamily: FONT_FAMILY, fontSize: '28px', fontStyle: 'bold', color: '#fbf6ec', backgroundColor: '#1f1a17cc', padding: { x: 8, y: 3 } })
      .setOrigin(0.5, 0), 0x1f1a17, 0.8, 10);
    this.sponge.on(Phaser.Input.Events.POINTER_UP, () => {
      const s = session();
      if (!s.bowlNeedsWash) this.flash('the bowl is clean!');
      else if (s.doughBatch && s.doughBatch.totalScoops > 0) this.flash('finish this batch first, then wash the bowl');
      else this.flash('scrub round and round in the bowl');
    });
    this.tweens.add({ targets: this.sponge, angle: { from: -6, to: 6 }, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut' });

    for (const ing of balance.dough.ingredients) {
      const img = this.add.image(0, 0, TextureKeys.IngredientBin).setTint(hexToNumber(ing.color)).setName(`bin-${ing.id}`);
      img.setInteractive({ useHandCursor: true });
      img.on(Phaser.Input.Events.POINTER_UP, () => this.scoop(ing.id));
      this.bins.push({
        id: ing.id,
        img,
        name: this.add.text(0, 0, ing.name, { fontFamily: FONT_FAMILY, fontSize: '28px', color: CSS.cream, align: 'center', wordWrap: { width: 175 } }).setOrigin(0.5, 0),
        count: this.add.text(0, 0, '', { fontFamily: FONT_FAMILY, fontSize: '40px', fontStyle: 'bold', color: CSS.ink }).setOrigin(0.5),
      });
    }

    this.instruction = text(40, CSS.cream, true).setName('dough-instruction');
    this.readout = text(34, CSS.muted).setName('dough-readout');
    const r = balance.dough.recipe;
    const names = new Map(balance.dough.ingredients.map((i) => [i.id, i.name]));
    this.recipe = text(32, CSS.cream)
      .setText(`recipe (one batch = ${balance.dough.batchSize} donuts):\n${Object.entries(r).map(([id, n]) => `${n} ${names.get(id)}`).join(' · ')}`)
      .setBackgroundColor('#00000033')
      .setPadding(20, 12, 20, 12)
      .setWordWrapWidth(900);
    this.flashText = roundBg(text(46, CSS.ink, true).setBackgroundColor(CSS.cream).setPadding(24, 14, 24, 14).setDepth(30).setVisible(false).setName('dough-flash'), COLORS.cream);

    this.redoButton = new Button(this, 0, 0, 'Start over', () => this.startOver(), { width: 340, fill: COLORS.danger, name: 'btn-dough-redo' });
    this.doneButton = new Button(this, 0, 0, 'Into the tub', () => this.done(), { width: 400, name: 'btn-dough-done' });

    this.bowlZone.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => this.startStir(p));
    this.events.on(Phaser.Scenes.Events.SLEEP, this.stopStir, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.events.off(Phaser.Scenes.Events.SLEEP, this.stopStir, this));
    // Faded buttons say why when tapped.
    this.redoButton.setWhy(() => 'nothing in the bowl yet');
    this.doneButton.setWhy(() => {
      const w = session().doughBatch;
      if (!w || w.totalScoops === 0) return 'scoop the recipe into the bowl first';
      if (w.stage !== 'ready') return 'stir it smooth first';
      if (w.yield > session().tubSpace) return 'the tub is too full for this batch';
      return 'that batch is missing something';
    });
    listen(this, session().events, 'changed', () => this.refresh());
    listen(this, session().events, 'doughMade', ({ quality }) => popScore(this, this.bowlPos.x, this.bowlPos.y - 120 * this.bowlPos.scale, quality * 100));
  }

  protected layoutStation(v: Viewport): void {
    const L = LAYOUT[v.orientation];
    const c = v.content;
    this.bowlPos = { x: c.x + L.bowl.x, y: c.y + L.bowl.y, scale: L.bowl.scale };
    this.bowl.setPosition(this.bowlPos.x, this.bowlPos.y).setScale(L.bowl.scale);
    this.bowlZone.setPosition(this.bowlPos.x, this.bowlPos.y + OPENING.dy * L.bowl.scale).setSize(360 * L.bowl.scale, 230 * L.bowl.scale);
    // The sponge sits on the bowl's rim, top right.
    const sx = this.bowlPos.x + 210 * L.bowl.scale;
    const sy = this.bowlPos.y - 120 * L.bowl.scale;
    this.sponge.setPosition(sx, sy).setScale(0.8);
    this.spongeLabel.setPosition(sx, sy + 34);
    this.tubPos = { x: c.x + L.tub.x, y: c.y + L.tub.y };
    this.tubText.setPosition(this.tubPos.x, this.tubPos.y - 28);
    const n = this.bins.length;
    this.bins.forEach((b, i) => {
      const x = c.x + L.bins.x + (i - (n - 1) / 2) * L.bins.step;
      const y = c.y + L.bins.y;
      b.img.setPosition(x, y).setScale(L.bins.scale);
      b.count.setPosition(x, y + 15 * L.bins.scale);
      b.name.setPosition(x, y + 105 * L.bins.scale + 6).setScale(Math.min(1, L.bins.scale + 0.3));
    });
    this.instruction.setPosition(c.x + L.instruction.x, c.y + L.instruction.y);
    this.readout.setPosition(c.x + L.readout.x, c.y + L.readout.y);
    this.recipe.setPosition(c.x + L.recipe.x, c.y + L.recipe.y).setWordWrapWidth(v.orientation === 'landscape' ? 820 : 980);
    this.flashText.setPosition(this.bowlPos.x, this.bowlPos.y);
    this.redoButton.setPosition(c.x + L.buttons.redoX, c.y + L.buttons.y).setScale(L.buttons.scale);
    this.doneButton.setPosition(c.x + L.buttons.doneX, c.y + L.buttons.y).setScale(L.buttons.scale);
    this.refresh();
  }

  // ---- State → screen -----------------------------------------------------------

  private refresh(): void {
    const s = session();
    const w = s.doughBatch;
    const D = balance.dough;
    const left = Number.isFinite(s.dough) ? s.dough : D.tubCapacity;

    // Tub: a bar of donuts' worth of dough.
    this.tubText.setText(`dough tub: ${left} donut${left === 1 ? '' : 's'}`);
    const bw = 520;
    this.tubBar.clear();
    this.tubBar.fillStyle(0x2b2522);
    this.tubBar.fillRoundedRect(this.tubPos.x - bw / 2, this.tubPos.y + 8, bw, 34, 12);
    this.tubBar.fillStyle(left < 3 ? 0xe57373 : 0xf2d9a0);
    if (left > 0) this.tubBar.fillRoundedRect(this.tubPos.x - bw / 2 + 4, this.tubPos.y + 12, Math.max(0, (bw - 8) * Math.min(1, left / D.tubCapacity)), 26, 10);

    for (const b of this.bins) {
      const n = w?.scoopsOf(b.id) ?? 0;
      b.count.setText(n ? `×${n}` : '');
      // How much is left in stock (when supplies are counted).
      const have = s.stockOf(b.id);
      const name = balance.dough.ingredients.find((i) => i.id === b.id)!.name;
      b.name.setText(Number.isFinite(have) ? `${name}\n${have} left` : name).setColor(have < 1 ? '#ff9b9b' : CSS.cream);
      b.img.setAlpha(have < 1 ? 0.45 : 1);
    }

    this.setSubtitle(s.phase === 'prep' ? 'morning prep: make the day’s dough' : `tub ${left}/${D.tubCapacity}`);
    const empty = !w || w.totalScoops === 0;
    if (empty && s.bowlMoldy) this.instruction.setText('the bowl grew mold! scrub round it to wash it');
    else if (empty && s.bowlNeedsWash && s.phase === 'closing') this.instruction.setText('closing: scrub round the bowl to wash it');
    else if (empty) this.instruction.setText(s.tubFull ? 'the tub is full!' : 'tap the ingredients to scoop them in');
    else if (w.stage !== 'ready') this.instruction.setText('stir: drag round and round in the bowl');
    else this.instruction.setText('smooth! tip it into the tub');
    if (empty && s.bowlNeedsWash) this.readout.setText(`bowl washed ${Math.round(s.bowlWashProgress * 100)}% · scrub round the empty bowl`);
    else if (empty) this.readout.setText('follow the recipe below (double it for twice the donuts)');
    else {
      // How much it makes depends on the ingredient you have least of.
      const names = new Map(D.ingredients.map((i) => [i.id, i.name]));
      const makes = w.yield ? `makes ${w.yield} donut${w.yield === 1 ? '' : 's'}` : `needs ${w.missing.map((id) => names.get(id)).join(', ')}`;
      const fits = w.yield > s.tubSpace ? ' · too much for the tub!' : '';
      this.readout.setText(`${makes}${fits} · stirred ${Math.round(w.stirProgress * 100)}%${w.stage === 'ready' && w.yield ? ` · ${doughVerdict(w.quality)}` : ''}`);
    }

    this.redoButton.setEnabled(!!w && w.totalScoops > 0);
    this.doneButton.setEnabled(!!w && w.stage === 'ready' && w.yield >= 1 && w.yield <= s.tubSpace);
    this.drawContents();
    // The sponge: bright when the bowl needs a wash, faded when it's clean.
    const dirty = s.bowlNeedsWash;
    this.sponge.setAlpha(dirty ? 1 : 0.5);
    this.spongeLabel.setText(dirty ? (s.bowlMoldy ? 'moldy! scrub it' : 'scrub to wash') : 'sponge').setAlpha(dirty ? 1 : 0.6);
  }

  /** The dough in the bowl: the ingredients' mixed colour, lumps that smooth out, and a swirl as you stir. */
  private drawContents(): void {
    const g = this.contents;
    g.clear();
    const s = session();
    const w = s.doughBatch;
    const { x, y, scale } = this.bowlPos;
    const cx = x;
    const cy = y + OPENING.dy * scale;
    const rx = OPENING.rx * scale;
    const ry = OPENING.ry * scale;
    if (!w || w.totalScoops === 0) {
      // An empty bowl that needs washing: dried dough smears (fading as you scrub), and mold if it sat overnight.
      if (!s.bowlNeedsWash) return;
      const left = 1 - s.bowlWashProgress;
      g.fillStyle(0xe8d9b8, 0.85 * left);
      for (const l of this.lumps) g.fillEllipse(cx + l.x * rx * 0.85, cy + l.y * ry * 0.85, l.r * rx * 2.2, l.r * ry * 1.6);
      if (s.bowlMoldy) {
        this.lumps.forEach((l, i) => {
          if (i % 2) return;
          g.fillStyle(0x9fb38a, 0.4 * left);
          g.fillCircle(cx - l.y * rx * 0.7, cy + l.x * ry * 0.7, l.r * rx * 1.3);
          g.fillStyle(0x5f7a4f, 0.85 * left);
          g.fillCircle(cx - l.y * rx * 0.7, cy + l.x * ry * 0.7, l.r * rx * 0.7);
        });
      }
      return;
    }
    // Fill level grows with the scoops (up to the recipe's amount).
    const total = Object.values(balance.dough.recipe).reduce((a, b) => a + b, 0);
    const fill = Math.min(1, 0.35 + (0.65 * w.totalScoops) / total);
    let r = 0;
    let gr = 0;
    let b = 0;
    for (const ing of balance.dough.ingredients) {
      const n = w.scoopsOf(ing.id);
      const col = hexToNumber(ing.color);
      r += ((col >> 16) & 255) * n;
      gr += ((col >> 8) & 255) * n;
      b += (col & 255) * n;
    }
    const k = 1 / w.totalScoops;
    // Rice-flour dough is a warm cream; tint the mix slightly towards it.
    const mix = (Math.round(r * k * 0.92) << 16) | (Math.round(gr * k * 0.88) << 8) | Math.round(b * k * 0.78);
    g.fillStyle(mix);
    g.fillEllipse(cx, cy, rx * 2 * fill, ry * 2 * fill);
    // Lumps fade as it gets smooth.
    const lumpy = 1 - w.stirProgress;
    if (lumpy > 0) {
      g.fillStyle(0xfffaf0, 0.9 * lumpy);
      for (const l of this.lumps) g.fillCircle(cx + l.x * rx * fill, cy + l.y * ry * fill, l.r * rx);
    }
    // A swirl that turns with the stirring.
    if (w.turns > 0) {
      g.lineStyle(5, 0x000000, 0.12);
      const t0 = w.turns * Math.PI * 2;
      g.beginPath();
      for (let i = 0; i <= 24; i++) {
        const a = t0 + (i / 24) * Math.PI * 3;
        const d = 0.15 + (i / 24) * 0.7;
        const px = cx + Math.cos(a) * rx * fill * d;
        const py = cy + Math.sin(a) * ry * fill * d;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.strokePath();
    }
  }

  // ---- Scooping and stirring ---------------------------------------------------------

  private scoop(id: string): void {
    const s = session();
    if (s.tubFull && !s.doughBatch) {
      this.flash('the tub is full: fry some first');
      return;
    }
    if (s.bowlMoldy && !s.doughBatch) {
      this.flash('the bowl grew mold! scrub it clean first');
      return;
    }
    if (!s.scoop(id)) {
      const ing = balance.dough.ingredients.find((i) => i.id === id);
      this.flash(`out of ${ing?.name ?? id}! buy more at the store`);
      return;
    }
    audio().play('shake');
    // A scoop flies from the bin into the bowl.
    const bin = this.bins.find((b) => b.id === id)!;
    const ing = balance.dough.ingredients.find((i) => i.id === id)!;
    const blob = this.add.circle(bin.img.x, bin.img.y - 40, 26, hexToNumber(ing.color)).setStrokeStyle(4, COLORS.ink).setDepth(15);
    this.tweens.add({
      targets: blob,
      x: this.bowlPos.x,
      y: this.bowlPos.y + OPENING.dy * this.bowlPos.scale,
      scale: 0.6,
      duration: 320,
      ease: 'Quad.In',
      onComplete: () => blob.destroy(),
    });
    this.refresh();
  }

  private angleAt(p: Phaser.Input.Pointer): number {
    const cy = this.bowlPos.y + OPENING.dy * this.bowlPos.scale;
    // Squash the bowl's ellipse back into a circle so a round stir counts evenly.
    return Math.atan2((p.y - cy) * (OPENING.rx / OPENING.ry), p.x - this.bowlPos.x);
  }

  private startStir(p: Phaser.Input.Pointer): void {
    const w = session().doughBatch;
    this.washing = (!w || w.totalScoops === 0) && session().bowlNeedsWash;
    if (!this.washing && (!w || w.totalScoops === 0)) {
      this.flash('scoop the ingredients in first');
      return;
    }
    this.stirPointer = p;
    this.lastAngle = this.angleAt(p);
    this.spoon.setVisible(true);
  }

  private stopStir(): void {
    this.stirPointer = null;
    this.spoon.setVisible(false);
  }

  override update(time: number): void {
    const p = this.stirPointer;
    if (!p) return;
    if (!p.isDown) {
      this.stopStir();
      return;
    }
    const a = this.angleAt(p);
    let d = a - this.lastAngle;
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    this.lastAngle = a;
    if (this.washing) {
      this.scrubBowl(p, d, time);
      return;
    }
    const w = session().doughBatch;
    if (!w) {
      this.stopStir();
      return;
    }
    // A function, so TypeScript doesn't assume the stage can't change when stir() runs.
    const ready = () => w.stage === 'ready';
    const wasReady = ready();
    if (d !== 0) {
      w.stir(d);
      if (time >= this.nextStirSound) {
        this.nextStirSound = time + 220;
        audio().play('pour');
      }
      this.refresh();
      if (!wasReady && ready()) {
        audio().play('ding');
        this.flash(doughVerdict(w.quality));
      }
    }
    // The spoon follows the finger.
    this.spoon.clear();
    this.spoon.lineStyle(14, 0x9c6b3e);
    this.spoon.lineBetween(p.x, p.y, p.x + 70, p.y - 150);
    this.spoon.fillStyle(0x9c6b3e);
    this.spoon.fillEllipse(p.x, p.y, 46, 30);
  }

  /** Scrubbing the empty bowl round and round with a sponge. */
  private scrubBowl(p: Phaser.Input.Pointer, d: number, time: number): void {
    const s = session();
    if (d !== 0 && s.washBowl(Math.abs(d) / (Math.PI * 2))) {
      audio().play('ding');
      this.flash('sparkling clean!');
      this.stopStir();
      this.refresh();
      return;
    }
    if (d !== 0) {
      if (time >= this.nextStirSound) {
        this.nextStirSound = time + 180;
        audio().play('scrub');
      }
      this.refresh();
    }
    // A sponge, not the spoon.
    this.spoon.clear();
    this.spoon.fillStyle(0xf2d14b);
    this.spoon.fillRoundedRect(p.x - 40, p.y - 26, 80, 52, 12);
    this.spoon.fillStyle(0x6fbf73);
    this.spoon.fillRoundedRect(p.x - 40, p.y - 26, 80, 16, { tl: 12, tr: 12, bl: 0, br: 0 });
    this.spoon.lineStyle(4, COLORS.ink);
    this.spoon.strokeRoundedRect(p.x - 40, p.y - 26, 80, 52, 12);
  }

  // ---- Actions -------------------------------------------------------------------

  private done(): void {
    const s = session();
    const w = s.doughBatch;
    const res = s.finishDough();
    if (!res) {
      if (w && w.yield < 1) this.flash('that makes no dough: add every ingredient');
      else this.flash('too much for the tub!');
      return;
    }
    audio().play('lid');
    this.flash(`+${res.added} donuts of dough!`);
  }

  private startOver(): void {
    if (session().trashDough()) {
      audio().play('trash');
      this.flash('tossed: start a fresh batch');
    }
  }

  private flash(text: string): void {
    this.tweens.killTweensOf(this.flashText);
    this.flashText.setText(text).setVisible(true).setAlpha(1);
    this.tweens.add({ targets: this.flashText, alpha: 0, delay: 1300, duration: 400, onComplete: () => this.flashText.setVisible(false) });
  }
}
