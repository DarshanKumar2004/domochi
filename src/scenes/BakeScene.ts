import Phaser from 'phaser';
import { TextureKeys } from '../assets/keys';
import type { Kolache } from '../stations/kolache';
import { sideItemsForDay } from '../stations/sides';
import { audio, balance, menu, session } from '../systems/services';
import { fillingStockId, sideToppingStockId } from '../systems/supplies';
import { Button } from '../ui/Button';
import { Dial } from '../ui/Dial';
import { HoldButton } from '../ui/HoldButton';
import type { Viewport } from '../ui/layout';
import { roundBg } from '../ui/roundBg';
import { drawKolache } from '../ui/sideArt';
import { SidePacker } from '../ui/SidePacker';
import { COLORS, CSS, FONT_FAMILY } from '../ui/theme';
import { listen } from './listen';
import { SceneKeys } from './sceneKeys';
import { StationScene } from './StationScene';
import { popScore } from '../ui/popText';

const GOOD = 0x7fd1ae;
const LOW = 0xf0a23a;
const OVER = 0xe0574f;
/** Meters show 0 → METER_MAX (1 = just right). */
const METER_MAX = 2;

/** Positions are offsets inside the content area. */
const LAYOUT = {
  portrait: {
    pan: { x: 370, y: 400, cell: 190 },
    tools: { x: 125, y: 790, step: 175, size: 116 },
    spoon: { x: 880, y: 270 },
    shape: { x: 880, y: 410 },
    toss: { x: 880, y: 540 },
    meters: { x: 150, y: 650, w: 300, cols: 2, colStep: 490 },
    oven: { x: 260, y: 1045, scale: 0.72 },
    dial: { x: 600, y: 1000, r: 80, temp: { x: 890, y: 1110 } },
    ovenBtn: { x: 890, y: 990, scale: 0.6 },
    packer: { ready: { x: 90, y: 1365, step: 92, size: 80 }, box: { x: 850, y: 1345, w: 330, h: 150 }, close: { x: 850, y: 1475, scale: 0.6 }, hint: { x: 540, y: 1225, width: 1000 } },
    flash: { x: 540, y: 420 },
  },
  landscape: {
    pan: { x: 330, y: 300, cell: 170 },
    tools: { x: 90, y: 625, step: 140, size: 100 },
    spoon: { x: 790, y: 230 },
    shape: { x: 790, y: 375 },
    toss: { x: 790, y: 505 },
    meters: { x: 1080, y: 575, w: 230, cols: 1, colStep: 0 },
    oven: { x: 1170, y: 290, scale: 0.75 },
    dial: { x: 1470, y: 250, r: 80, temp: { x: 1470, y: 420 } },
    ovenBtn: { x: 1170, y: 470, scale: 0.7 },
    packer: { ready: { x: 1590, y: 600, step: 86, size: 78, cols: 3 }, box: { x: 1760, y: 330, w: 280, h: 160 }, close: { x: 1760, y: 470, scale: 0.55 }, hint: { x: 1760, y: 185, width: 300 } },
    flash: { x: 960, y: 380 },
  },
} as const;

type Tool = { kind: 'filling' | 'topping' | 'brush'; id: string; zone: Phaser.GameObjects.Zone; label: Phaser.GameObjects.Text };

/**
 * Kolaches: put dough balls on the sheet pan (tap a spot), then for each one:
 * pick a filling, hold the spoon to fill it, hold to fold & pinch (savory)
 * or press the well (sweet), add its topping, and brush it with egg wash
 * (drag the brush over it). They rise while they wait. Slide the pan into the
 * oven, watch the colour, and take it out golden. Baked kolaches go on the
 * rack; pack them into the order's kolache box.
 */
export class BakeScene extends StationScene {
  private art!: Phaser.GameObjects.Graphics;
  private panZones: Phaser.GameObjects.Zone[] = [];
  private tools: Tool[] = [];
  private toolArt!: Phaser.GameObjects.Graphics;
  private brush!: Phaser.GameObjects.Container;
  private brushHome = { x: 0, y: 0 };
  private spoon!: HoldButton;
  private shapeBtn!: HoldButton;
  private toss!: Button;
  private ovenImg!: Phaser.GameObjects.Image;
  private ovenArt!: Phaser.GameObjects.Graphics;
  private dial!: Dial;
  private tempText!: Phaser.GameObjects.Text;
  private ovenBtn!: Button;
  private meterArt!: Phaser.GameObjects.Graphics;
  private meterLabels: Phaser.GameObjects.Text[] = [];
  private flashText!: Phaser.GameObjects.Text;
  private packer!: SidePacker;
  private selected = -1;
  private panPos = { x: 0, y: 0, cell: 0 };
  private ovenPos = { x: 0, y: 0, scale: 1 };
  private metersPos = { x: 0, y: 0, w: 0, cols: 1, colStep: 0 };
  private shownTemp = NaN;
  private shownStyle = '';
  /** Where the brush was last frame (for how far it moved over each kolache). */
  private lastBrush: { x: number; y: number } | null = null;

  constructor() {
    super(SceneKeys.Bake, 'Bake Station', 0x6b4f3a, null);
  }

  protected override headerPosition(v: Viewport) {
    if (v.orientation === 'landscape') return { x: v.content.x + 1170, titleY: v.content.y + 45, subtitleY: v.content.y + 100 };
    return super.headerPosition(v);
  }

  protected buildStation(): void {
    this.panZones = [];
    this.tools = [];
    this.meterLabels = [];
    this.selected = -1;
    this.shownTemp = NaN;
    this.shownStyle = '';
    this.lastBrush = null;
    const b = balance.bake;

    this.art = this.add.graphics().setDepth(2);
    for (let i = 0; i < b.panSize; i++) {
      const z = this.add.zone(0, 0, 10, 10).setName(`bake-pan-${i}`).setInteractive({ useHandCursor: true });
      z.on(Phaser.Input.Events.POINTER_UP, () => this.tapPan(i));
      this.panZones.push(z);
    }

    // Fillings and toppings on the menu by today, then the egg-wash brush.
    this.toolArt = this.add.graphics().setDepth(2);
    const m = menu.sides?.kolache;
    const today = sideItemsForDay(m, session().day);
    const fillings = m ? m.fillings.filter((f) => today.some((i) => i.filling === f.id)) : [];
    const toppings = m ? m.toppings.filter((t) => today.some((i) => i.toppings.includes(t.id))) : [];
    const label = (text: string) =>
      this.add.text(0, 0, text, { fontFamily: FONT_FAMILY, fontSize: '25px', color: CSS.cream, align: 'center', wordWrap: { width: 205 } }).setOrigin(0.5, 0).setDepth(3);
    for (const f of fillings) {
      const zone = this.add.zone(0, 0, 10, 10).setName(`bake-filling-${f.id}`).setInteractive({ useHandCursor: true });
      zone.on(Phaser.Input.Events.POINTER_UP, () => this.pickFilling(f.id));
      this.tools.push({ kind: 'filling', id: f.id, zone, label: label(f.name) });
    }
    for (const t of toppings) {
      const zone = this.add.zone(0, 0, 10, 10).setName(`bake-topping-${t.id}`).setInteractive({ useHandCursor: true });
      zone.on(Phaser.Input.Events.POINTER_UP, () => this.addTopping(t.id));
      this.tools.push({ kind: 'topping', id: t.id, zone, label: label(t.name) });
    }

    // The brush: drag it over the kolaches (or tap it to brush the selected one).
    const bg = this.make.graphics({}, false);
    bg.fillStyle(0xc98f4e);
    bg.fillRoundedRect(-14, -70, 28, 90, 10);
    bg.fillStyle(0xf2d27a);
    bg.fillRoundedRect(-30, 14, 60, 50, 12);
    bg.lineStyle(4, COLORS.ink);
    bg.strokeRoundedRect(-14, -70, 28, 90, 10);
    bg.strokeRoundedRect(-30, 14, 60, 50, 12);
    const brushHit = new Phaser.GameObjects.Zone(this, 0, 0, 130, 150);
    this.brush = this.add.container(0, 0, [bg, brushHit]).setDepth(20).setSize(130, 150);
    this.brush.setInteractive({ draggable: true, useHandCursor: true });
    this.brush.setName('bake-brush');
    let dragged = false;
    this.brush.on(Phaser.Input.Events.POINTER_DOWN, () => (dragged = false));
    this.brush.on(Phaser.Input.Events.DRAG, (_p: Phaser.Input.Pointer, x: number, y: number) => {
      dragged = true;
      this.brush.setPosition(x, y);
      this.brushOver(x, y + 40);
    });
    this.brush.on(Phaser.Input.Events.DRAG_END, () => {
      this.lastBrush = null;
      this.tweens.add({ targets: this.brush, x: this.brushHome.x, y: this.brushHome.y, duration: 200 });
    });
    this.brush.on(Phaser.Input.Events.POINTER_UP, () => {
      if (!dragged) this.brushSelected();
    });
    this.tools.push({ kind: 'brush', id: 'brush', zone: brushHit, label: label('egg wash') });

    this.spoon = new HoldButton(this, 0, 0, 'hold: spoon\nfilling', (held) => session().holdKolache(this.selected, held ? 'fill' : null), 300, 140, 'bake-spoon');
    this.shapeBtn = new HoldButton(this, 0, 0, 'hold: fold\n& pinch', (held) => session().holdKolache(this.selected, held ? 'shape' : null), 300, 140, 'bake-shape');
    this.toss = new Button(this, 0, 0, 'Toss it', () => this.tossSelected(), { width: 300, height: 120, fontSize: 40, fill: COLORS.danger, name: 'btn-bake-toss' });

    this.ovenImg = this.add.image(0, 0, TextureKeys.Oven).setDepth(1);
    this.ovenArt = this.add.graphics().setDepth(2);
    this.dial = new Dial(this, 90, b.oven.dial.minF, b.oven.dial.maxF, b.oven.idealRangeF, (f) => session().bakery.setTarget(f), 'bake-dial');
    this.dial.setDepth(3);
    this.tempText = this.add.text(0, 0, '', { fontFamily: FONT_FAMILY, fontSize: '34px', fontStyle: 'bold', color: CSS.cream, align: 'center' }).setOrigin(0.5).setDepth(3).setName('bake-temp');
    this.ovenBtn = new Button(this, 0, 0, 'Into the oven', () => this.ovenToggle(), { width: 480, height: 130, name: 'btn-oven' });

    this.meterArt = this.add.graphics().setDepth(3);
    for (const name of ['rise', 'filling', 'shape', 'egg wash']) {
      this.meterLabels.push(this.add.text(0, 0, name, { fontFamily: FONT_FAMILY, fontSize: '28px', color: CSS.cream }).setOrigin(1, 0.5).setDepth(3));
    }

    this.flashText = roundBg(
      this.add.text(0, 0, '', { fontFamily: FONT_FAMILY, fontSize: '44px', fontStyle: 'bold', color: CSS.ink, align: 'center' }).setPadding(24, 14, 24, 14).setDepth(40).setVisible(false).setName('bake-flash'),
      COLORS.cream,
    );
    this.packer = new SidePacker(this, 'kolache', session, menu, (t) => this.flash(t));
    // Faded buttons say why when tapped.
    const needBall = () => (session().bakery.inOven ? 'the pan is in the oven' : 'tap a dough ball on the pan first');
    this.spoon.setWhy(() => (this.selected < 0 || session().bakery.inOven ? needBall() : 'pick a filling first'));
    this.shapeBtn.setWhy(needBall);
    this.toss.setWhy(needBall);
    this.ovenBtn.setWhy(() => 'put some dough on the pan first');
    listen(this, session().events, 'changed', () => this.refresh());
    listen(this, session().events, 'kolacheBurnt', ({ slots }) => {
      audio().play('burn');
      this.flash(slots.length > 1 ? 'the kolaches burnt!' : 'a kolache burnt!');
    });
  }

  protected layoutStation(v: Viewport): void {
    const L = LAYOUT[v.orientation];
    const c = v.content;
    this.panPos = { x: c.x + L.pan.x, y: c.y + L.pan.y, cell: L.pan.cell };
    this.panZones.forEach((z, i) => {
      const p = this.spot(i);
      z.setPosition(p.x, p.y).setSize(L.pan.cell, L.pan.cell);
      if (z.input) z.input.hitArea.setTo(0, 0, L.pan.cell, L.pan.cell);
    });
    const t = L.tools;
    this.tools.forEach((tool, i) => {
      const x = c.x + t.x + i * t.step;
      const y = c.y + t.y;
      if (tool.kind === 'brush') {
        this.brushHome = { x, y };
        this.brush.setPosition(x, y);
      } else {
        tool.zone.setPosition(x, y).setSize(t.size + 20, t.size + 20);
        if (tool.zone.input) tool.zone.input.hitArea.setTo(0, 0, t.size + 20, t.size + 20);
      }
      tool.label.setPosition(x, y + t.size / 2 + 12);
    });
    this.spoon.setPosition(c.x + L.spoon.x, c.y + L.spoon.y);
    this.shapeBtn.setPosition(c.x + L.shape.x, c.y + L.shape.y);
    this.toss.setPosition(c.x + L.toss.x, c.y + L.toss.y);
    this.metersPos = { x: c.x + L.meters.x, y: c.y + L.meters.y, w: L.meters.w, cols: L.meters.cols, colStep: L.meters.colStep };
    this.meterLabels.forEach((l, i) => {
      const p = this.meterAt(i);
      l.setPosition(p.x - 12, p.y);
    });
    this.ovenPos = { x: c.x + L.oven.x, y: c.y + L.oven.y, scale: L.oven.scale };
    this.ovenImg.setPosition(this.ovenPos.x, this.ovenPos.y).setScale(L.oven.scale);
    this.dial.setPosition(c.x + L.dial.x, c.y + L.dial.y).setScale(L.dial.r / 90);
    this.tempText.setPosition(c.x + L.dial.temp.x, c.y + L.dial.temp.y);
    this.ovenBtn.setPosition(c.x + L.ovenBtn.x, c.y + L.ovenBtn.y).setScale(L.ovenBtn.scale);
    const pk = L.packer;
    const at = (p: { x: number; y: number }) => ({ x: c.x + p.x, y: c.y + p.y });
    this.packer.layout({
      ready: { ...pk.ready, ...at(pk.ready) },
      box: { ...pk.box, ...at(pk.box) },
      close: { ...pk.close, ...at(pk.close) },
      hint: { ...pk.hint, ...at(pk.hint) },
    });
    this.flashText.setPosition(c.x + L.flash.x, c.y + L.flash.y);
    this.refresh();
  }

  /** Where meter i goes (in a grid of metersPos.cols columns). */
  private meterAt(i: number): { x: number; y: number } {
    const m = this.metersPos;
    return { x: m.x + (i % m.cols) * m.colStep, y: m.y + Math.floor(i / m.cols) * 40 };
  }

  private spot(i: number): { x: number; y: number } {
    const p = this.panPos;
    return { x: p.x + ((i % 3) - 1) * p.cell, y: p.y + (Math.floor(i / 3) - 0.5) * p.cell };
  }

  // ---- State → screen ----------------------------------------------------------

  private refresh(): void {
    const s = session();
    const bk = s.bakery;
    if (this.selected >= 0 && (!bk.pan[this.selected] || bk.inOven)) this.selected = -1;
    this.packer.refresh();
    this.ovenBtn.setLabel(bk.inOven ? 'Take it out' : 'Into the oven').setEnabled(bk.inOven || bk.panCount > 0);
    this.drawTools();
    const k = this.selectedKolache();
    const raw = !!k && k.baked === 0 && !bk.inOven;
    this.spoon.setEnabled(raw && !!k?.filling);
    this.shapeBtn.setEnabled(raw);
    this.toss.setEnabled(raw);
    const style = k?.filling ? (menu.sides?.kolache.fillings.find((f) => f.id === k.filling)?.style ?? 'wrap') : 'wrap';
    if (style !== this.shownStyle) {
      this.shownStyle = style;
      const label = this.shapeBtn.list.find((o) => o instanceof Phaser.GameObjects.Text) as Phaser.GameObjects.Text | undefined;
      label?.setText(style === 'well' ? 'hold: press\nthe well' : 'hold: fold\n& pinch');
    }
    const dough = s.stockOf('kolache-dough');
    this.setSubtitle(
      bk.inOven
        ? 'baking… take it out golden'
        : `${Number.isFinite(dough) ? `dough balls: ${dough} · ` : ''}tap the pan to add dough`,
    );
  }

  private drawTools(): void {
    const g = this.toolArt;
    const m = menu.sides?.kolache;
    const s = session();
    g.clear();
    const k = this.selectedKolache();
    for (const tool of this.tools) {
      if (tool.kind === 'brush') continue;
      const x = tool.zone.x;
      const y = tool.zone.y;
      const r = tool.zone.width / 2 - 14;
      const stockId = tool.kind === 'filling' ? fillingStockId(tool.id) : sideToppingStockId(tool.id);
      const out = s.stockOf(stockId) < 1;
      const chosen = tool.kind === 'filling' && k?.filling === tool.id;
      // A bowl of filling, or a shaker jar of topping.
      g.fillStyle(0x000000, 0.25);
      g.fillCircle(x + 4, y + 8, r);
      g.fillStyle(0xfffaf0, out ? 0.4 : 1);
      g.fillCircle(x, y, r);
      g.lineStyle(chosen ? 9 : 5, chosen ? COLORS.pink : COLORS.ink);
      g.strokeCircle(x, y, r);
      if (tool.kind === 'filling') {
        const f = m?.fillings.find((x) => x.id === tool.id);
        if (f) {
          g.fillStyle(parseInt(f.color.slice(1), 16), out ? 0.3 : 1);
          g.fillCircle(x, y, r * 0.72);
          if (f.accent) {
            g.fillStyle(parseInt(f.accent.slice(1), 16), out ? 0.3 : 1);
            g.fillCircle(x + r * 0.2, y - r * 0.15, r * 0.25);
          }
        }
      } else {
        const t = m?.toppings.find((x) => x.id === tool.id);
        t?.colors.forEach((c, i) => {
          g.fillStyle(parseInt(c.slice(1), 16), out ? 0.3 : 1);
          for (let j = 0; j < 5; j++) g.fillCircle(x + Math.cos(i * 2 + j * 1.3) * r * 0.5, y + Math.sin(i * 2 + j * 1.3) * r * 0.5, 7);
        });
      }
      tool.label.setColor(out ? '#ff9a8a' : CSS.cream);
    }
  }

  private selectedKolache(): Kolache | null {
    return this.selected >= 0 ? session().bakery.pan[this.selected] ?? null : null;
  }

  override update(): void {
    const bk = session().bakery;
    const t = Math.round(bk.temp);
    if (t !== this.shownTemp) {
      this.shownTemp = t;
      const o = balance.bake.oven;
      this.tempText.setText(`oven ${t}°F\ndial ${bk.target}°F`).setColor(t < o.idealRangeF.min ? '#9fd8ff' : t > o.idealRangeF.max ? '#ff9a8a' : CSS.cream);
    }
    this.dial.show(bk.target);
    this.drawPan();
    this.drawOven();
    this.drawMeters();
  }

  private drawPan(): void {
    const g = this.art;
    const bk = session().bakery;
    const p = this.panPos;
    const m = menu.sides?.kolache;
    g.clear();
    const w = p.cell * 3 + 40;
    const h = p.cell * 2 + 40;
    g.fillStyle(0x000000, 0.25);
    g.fillRoundedRect(p.x - w / 2 + 8, p.y - h / 2 + 12, w, h, 20);
    g.fillStyle(bk.inOven ? 0x7d8287 : 0xaab0b5, bk.inOven ? 0.5 : 1);
    g.fillRoundedRect(p.x - w / 2, p.y - h / 2, w, h, 20);
    g.lineStyle(6, COLORS.ink, bk.inOven ? 0.5 : 1);
    g.strokeRoundedRect(p.x - w / 2, p.y - h / 2, w, h, 20);
    for (let i = 0; i < bk.pan.length; i++) {
      const sp = this.spot(i);
      const k = bk.pan[i];
      if (bk.inOven || !k) {
        // An empty spot: a faint ring of parchment, with a "+" to add dough.
        g.lineStyle(3, 0xffffff, 0.35);
        g.strokeCircle(sp.x, sp.y, p.cell * 0.36);
        continue;
      }
      drawKolache(g, sp.x, sp.y, p.cell * 0.38, k, m);
      if (i === this.selected) {
        g.lineStyle(6, COLORS.pink);
        g.strokeCircle(sp.x, sp.y, p.cell * 0.48);
      }
    }
  }

  private drawOven(): void {
    const g = this.ovenArt;
    const bk = session().bakery;
    const o = this.ovenPos;
    const sc = o.scale;
    g.clear();
    // The window (texture ≈ (40, 60)–(380, 250) of 430×316): the pan shows through it.
    const wx = o.x + (40 - 215) * sc;
    const wy = o.y + (60 - 158) * sc;
    const ww = 340 * sc;
    const wh = 190 * sc;
    const heat = Phaser.Math.Clamp((bk.temp - 250) / 200, 0, 1);
    g.fillStyle(0xff8a3d, 0.15 + heat * 0.35);
    g.fillRoundedRect(wx, wy, ww, wh, 16 * sc);
    if (!bk.inOven) return;
    const m = menu.sides?.kolache;
    let n = 0;
    let done = 0;
    for (let i = 0; i < bk.pan.length; i++) {
      const k = bk.pan[i];
      if (!k) continue;
      const col = i % 3;
      const row = Math.floor(i / 3);
      drawKolache(g, wx + ww * (0.2 + col * 0.3), wy + wh * (0.3 + row * 0.42), 34 * sc, k, m);
      n++;
      done += k.baked;
    }
    // How golden, under the window: green band = take it out.
    if (n) {
      const avg = done / n;
      const bw = ww;
      const by = wy + wh + 24 * sc;
      const pw = balance.bake.oven.doneness.perfectWithin;
      g.fillStyle(0x2b2522);
      g.fillRoundedRect(wx, by, bw, 18, 9);
      g.fillStyle(GOOD, 0.6);
      g.fillRect(wx + (bw * (1 - pw)) / 1.8, by, (bw * pw * 2) / 1.8, 18);
      g.fillStyle(avg > 1 + pw ? OVER : avg >= 1 - pw ? GOOD : LOW);
      g.fillRoundedRect(wx, by, Math.min(bw, (bw * avg) / 1.8), 18, 9);
    }
  }

  private drawMeters(): void {
    const g = this.meterArt;
    g.clear();
    const k = this.selectedKolache();
    const show = !!k;
    for (const l of this.meterLabels) l.setVisible(show);
    if (!k) return;
    const b = balance.bake;
    const bars: { v: number; ideal: { min: number; max: number } }[] = [
      { v: k.proof, ideal: b.proof.ideal },
      { v: k.fill, ideal: b.fill.ideal },
      { v: k.shape, ideal: b.shape.ideal },
      { v: k.wash, ideal: b.wash.ideal },
    ];
    const w = this.metersPos.w;
    bars.forEach((bar, i) => {
      const { x, y } = this.meterAt(i);
      const by = y - 10;
      g.fillStyle(0x2b2522);
      g.fillRoundedRect(x, by, w, 20, 10);
      g.fillStyle(GOOD, 0.5);
      g.fillRect(x + (w * bar.ideal.min) / METER_MAX, by, (w * (bar.ideal.max - bar.ideal.min)) / METER_MAX, 20);
      const color = bar.v > bar.ideal.max ? OVER : bar.v >= bar.ideal.min ? GOOD : LOW;
      g.fillStyle(color);
      g.fillRoundedRect(x, by + 4, Math.max(8, Math.min(w, (w * bar.v) / METER_MAX)), 12, 6);
    });
  }

  // ---- Actions ----------------------------------------------------------------

  private tapPan(i: number): void {
    const s = session();
    s.holdKolache(-1, null);
    const bk = s.bakery;
    if (bk.inOven) return this.flash('the pan is in the oven');
    if (bk.pan[i]) {
      this.selected = i;
      audio().play('tap');
      this.refresh();
      return;
    }
    if (s.stockOf('kolache-dough') < 1) return this.flash('out of kolache dough!\nbuy more at the store');
    const at = s.placeKolache(i);
    if (at >= 0) {
      this.selected = at;
      audio().play('drop');
    }
    this.refresh();
  }

  private pickFilling(id: string): void {
    if (this.selected < 0) return this.flash('tap a dough ball first');
    const r = session().setKolacheFilling(this.selected, id);
    if (r === 'none') this.flash('out of that filling!');
    else if (r === 'no') this.flash('it already has its filling');
    else audio().play('tap');
  }

  private addTopping(id: string): void {
    if (this.selected < 0) return this.flash('tap a kolache first');
    const r = session().addKolacheTopping(this.selected, id);
    if (r === 'none') this.flash('out of that topping!');
    else if (r === 'ok') audio().play('shake');
  }

  /** One stroke of egg wash on the selected kolache. */
  private brushSelected(): void {
    if (this.selected < 0) return this.flash('drag the brush over the kolaches');
    session().bakery.addWash(this.selected, 0.5);
  }

  /** The brush moved to (x, y): wash whatever it's over, by how far it moved. */
  private brushOver(x: number, y: number): void {
    const last = this.lastBrush;
    this.lastBrush = { x, y };
    if (!last) return;
    const bk = session().bakery;
    // The brush head is wide: anywhere over the kolache counts.
    const r = this.panPos.cell * 0.5;
    const moved = Phaser.Math.Distance.Between(last.x, last.y, x, y);
    for (let i = 0; i < bk.pan.length; i++) {
      if (!bk.pan[i]) continue;
      const sp = this.spot(i);
      // A stroke across a kolache (two radii) adds about 0.5.
      if (Phaser.Math.Distance.Between(sp.x, sp.y, x, y) < r) bk.addWash(i, (moved / (2 * this.panPos.cell * 0.38)) * 0.5);
    }
  }

  private tossSelected(): void {
    if (this.selected < 0) return;
    if (session().trashKolache(this.selected)) audio().play('trash');
    this.selected = -1;
    this.refresh();
  }

  private ovenToggle(): void {
    const s = session();
    if (s.bakery.inOven) {
      const before = s.bakery.rack.length;
      if (!s.ovenOut()) this.flash('the rack is full!\npack some kolaches first');
      else {
        audio().play('tap');
        // How the pan came out: the average of the kolaches just baked.
        const out = s.bakery.rack.slice(before);
        if (out.length) popScore(this, this.ovenPos.x, this.ovenPos.y - 60, out.reduce((a, k) => a + s.sideQualityOf('kolache', k), 0) / out.length);
      }
    } else if (s.ovenIn()) {
      this.selected = -1;
      audio().play('drop');
    }
    this.refresh();
  }

  private flash(text: string): void {
    this.tweens.killTweensOf(this.flashText);
    this.flashText.setText(text).setVisible(true).setAlpha(1);
    this.tweens.add({ targets: this.flashText, alpha: 0, delay: 1300, duration: 400, onComplete: () => this.flashText.setVisible(false) });
  }
}
