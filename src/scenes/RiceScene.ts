import Phaser from 'phaser';
import { TextureKeys } from '../assets/keys';
import { sideItemsForDay } from '../stations/sides';
import { rangeScore } from '../stations/sides';
import { audio, balance, menu, session } from '../systems/services';
import { clockText, fillingStockId, sideToppingStockId } from '../systems/supplies';
import { Button } from '../ui/Button';
import { HoldButton } from '../ui/HoldButton';
import type { Viewport } from '../ui/layout';
import { roundBg } from '../ui/roundBg';
import { drawOnigiri } from '../ui/sideArt';
import { SidePacker } from '../ui/SidePacker';
import { Slider } from '../ui/Slider';
import { COLORS, CSS, FONT_FAMILY } from '../ui/theme';
import { listen } from './listen';
import { SceneKeys } from './sceneKeys';
import { StationScene } from './StationScene';
import { popScore } from '../ui/popText';

const GOOD = 0x7fd1ae;
const LOW = 0xf0a23a;
const OVER = 0xe0574f;
/** The scoop meter shows 0 → 2 (1 = just right). */
const METER_MAX = 2;

const LAYOUT = {
  portrait: {
    cooker: { x: 220, y: 360, scale: 0.85 },
    cook: { x: 740, y: 290, scale: 0.8 },
    status: { x: 740, y: 420 },
    water: { x: 560, y: 590 },
    board: { x: 330, y: 900, r: 140 },
    nori: { x: 660, y: 900 },
    scoop: { x: 880, y: 740 },
    press: { x: 880, y: 890 },
    done: { x: 880, y: 1030 },
    toss: { x: 880, y: 1150 },
    meters: { x: 160, y: 1080, w: 340 },
    tools: { x: 100, y: 1180, step: 150, size: 100 },
    packer: { ready: { x: 90, y: 1455, step: 92, size: 80 }, box: { x: 850, y: 1425, w: 330, h: 150 }, close: { x: 850, y: 1515, scale: 0.55 }, hint: { x: 540, y: 1335, width: 1000 } },
    flash: { x: 540, y: 880 },
  },
  landscape: {
    cooker: { x: 170, y: 290, scale: 0.72 },
    cook: { x: 170, y: 495, scale: 0.6 },
    status: { x: 170, y: 575 },
    water: { x: 440, y: 700 },
    board: { x: 790, y: 320, r: 130 },
    nori: { x: 520, y: 320 },
    scoop: { x: 1180, y: 190 },
    press: { x: 1180, y: 325 },
    done: { x: 1180, y: 450 },
    toss: { x: 1180, y: 560 },
    meters: { x: 680, y: 530, w: 260 },
    tools: { x: 840, y: 640, step: 125, size: 96 },
    packer: { ready: { x: 1550, y: 335, step: 95, size: 84, cols: 3 }, box: { x: 1650, y: 575, w: 330, h: 140 }, close: { x: 1650, y: 710, scale: 0.55 }, hint: { x: 1650, y: 180, width: 440 } },
    flash: { x: 900, y: 330 },
  },
} as const;

type Tool = { kind: 'filling' | 'topping'; id: string; zone: Phaser.GameObjects.Zone; label: Phaser.GameObjects.Text };

/**
 * Onigiri: set the water and cook a pot of rice (it keeps cooking whichever
 * station you're at). Then for each onigiri: hold the paddle to scoop the
 * rice, pick a filling and tap the middle of the rice to put it in, press it
 * into a triangle (three firm presses: hold, let go), season it, and drag the
 * nori onto it. Done puts it on the tray; pack the tray into the order's
 * onigiri pack.
 */
export class RiceScene extends StationScene {
  private cookerImg!: Phaser.GameObjects.Image;
  private cookerArt!: Phaser.GameObjects.Graphics;
  private cookBtn!: Button;
  private status!: Phaser.GameObjects.Text;
  private water!: Slider;
  private waterLevel = 0.3;
  private boardArt!: Phaser.GameObjects.Graphics;
  private boardZone!: Phaser.GameObjects.Zone;
  private nori!: Phaser.GameObjects.Image;
  private noriHome = { x: 0, y: 0 };
  private scoop!: HoldButton;
  private press!: HoldButton;
  private pressStart = 0;
  private done!: Button;
  private toss!: Button;
  private tools: Tool[] = [];
  private toolArt!: Phaser.GameObjects.Graphics;
  private meterArt!: Phaser.GameObjects.Graphics;
  private meterLabels: Phaser.GameObjects.Text[] = [];
  private flashText!: Phaser.GameObjects.Text;
  private packer!: SidePacker;
  /** The filling picked, waiting for a tap on the rice. */
  private armed: string | null = null;
  private boardPos = { x: 0, y: 0, r: 0 };
  private cookerPos = { x: 0, y: 0, scale: 1 };
  private metersPos = { x: 0, y: 0, w: 0 };
  private shownStatus = '';

  constructor() {
    super(SceneKeys.Rice, 'Rice Station', 0x4a5d6b, null);
  }

  protected override headerPosition(v: Viewport) {
    if (v.orientation === 'landscape') return { x: v.content.x + 1650, titleY: v.content.y + 45, subtitleY: v.content.y + 100 };
    return super.headerPosition(v);
  }

  protected buildStation(): void {
    this.tools = [];
    this.meterLabels = [];
    this.armed = null;
    this.shownStatus = '';
    this.waterLevel = 0.3;

    this.cookerImg = this.add.image(0, 0, TextureKeys.RiceCooker).setDepth(1);
    this.cookerArt = this.add.graphics().setDepth(2);
    this.cookBtn = new Button(this, 0, 0, 'Cook rice', () => this.cook(), { width: 420, height: 130, name: 'btn-cook-rice' });
    this.status = this.add.text(0, 0, '', { fontFamily: FONT_FAMILY, fontSize: '32px', color: CSS.cream, align: 'center' }).setOrigin(0.5).setDepth(3).setName('rice-status');
    this.water = new Slider(this, 'water', this.waterLevel, (v) => (this.waterLevel = v), () => undefined, 'rice-water');
    this.water.setDepth(3);

    this.boardArt = this.add.graphics().setDepth(2);
    this.boardZone = this.add.zone(0, 0, 10, 10).setName('rice-board').setInteractive({ useHandCursor: true });
    this.boardZone.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => this.tapBoard(p.worldX, p.worldY));

    this.nori = this.add.image(0, 0, TextureKeys.Nori).setDepth(20).setName('rice-nori').setInteractive({ draggable: true, useHandCursor: true });
    let dragged = false;
    this.nori.on(Phaser.Input.Events.POINTER_DOWN, () => (dragged = false));
    this.nori.on(Phaser.Input.Events.DRAG, (_p: Phaser.Input.Pointer, x: number, y: number) => {
      dragged = true;
      this.nori.setPosition(x, y);
    });
    this.nori.on(Phaser.Input.Events.DRAG_END, () => this.dropNori());
    this.nori.on(Phaser.Input.Events.POINTER_UP, () => {
      if (!dragged) this.flash('drag the nori onto the rice');
    });

    this.scoop = new HoldButton(this, 0, 0, 'hold: scoop\nrice', (held) => {
      session().holdScoop(held);
      if (held) this.checkScoop();
    }, 300, 130, 'rice-scoop');
    this.press = new HoldButton(this, 0, 0, 'hold: press\n(×3)', (held) => this.pressChange(held), 300, 130, 'rice-press');
    this.done = new Button(this, 0, 0, 'Done', () => this.finish(), { width: 300, height: 120, name: 'btn-rice-done' });
    this.toss = new Button(this, 0, 0, 'Toss it', () => this.tossIt(), { width: 300, height: 110, fontSize: 40, fill: COLORS.danger, name: 'btn-rice-toss' });

    this.toolArt = this.add.graphics().setDepth(2);
    const m = menu.sides?.onigiri;
    const today = sideItemsForDay(m, session().day);
    const label = (text: string) =>
      this.add.text(0, 0, text, { fontFamily: FONT_FAMILY, fontSize: '26px', color: CSS.cream, align: 'center', wordWrap: { width: 145 } }).setOrigin(0.5, 0).setDepth(3);
    for (const f of m ? m.fillings.filter((f) => today.some((i) => i.filling === f.id)) : []) {
      const zone = this.add.zone(0, 0, 10, 10).setName(`rice-filling-${f.id}`).setInteractive({ useHandCursor: true });
      zone.on(Phaser.Input.Events.POINTER_UP, () => this.pickFilling(f.id));
      this.tools.push({ kind: 'filling', id: f.id, zone, label: label(f.name) });
    }
    for (const t of m ? m.toppings.filter((t) => today.some((i) => i.toppings.includes(t.id))) : []) {
      const zone = this.add.zone(0, 0, 10, 10).setName(`rice-topping-${t.id}`).setInteractive({ useHandCursor: true });
      zone.on(Phaser.Input.Events.POINTER_UP, () => this.addTopping(t.id));
      this.tools.push({ kind: 'topping', id: t.id, zone, label: label(t.name) });
    }

    this.meterArt = this.add.graphics().setDepth(3);
    for (const name of ['rice', 'shape']) {
      this.meterLabels.push(this.add.text(0, 0, name, { fontFamily: FONT_FAMILY, fontSize: '28px', color: CSS.cream }).setOrigin(1, 0.5).setDepth(3));
    }
    this.flashText = roundBg(
      this.add.text(0, 0, '', { fontFamily: FONT_FAMILY, fontSize: '44px', fontStyle: 'bold', color: CSS.ink, align: 'center' }).setPadding(24, 14, 24, 14).setDepth(40).setVisible(false).setName('rice-flash'),
      COLORS.cream,
    );
    this.packer = new SidePacker(this, 'onigiri', session, menu, (t) => this.flash(t), balance.rice.press.count);
    // Faded buttons say why when tapped.
    this.cookBtn.setWhy(() => (session().riceStation.cooker === 'cooking' ? 'the rice is cooking' : 'use up the rice in the pot first'));
    this.scoop.setWhy(() => {
      const r = session().riceStation;
      if (r.board) return "it's already pressed: wrap it and tap Done";
      return r.cooker === 'cooking' ? 'the rice is still cooking' : 'cook a pot of rice first';
    });
    this.press.setWhy(() => (session().riceStation.board ? "it's wrapped: tap Done" : 'scoop some rice first'));
    this.done.setWhy(() => 'scoop some rice first');
    this.toss.setWhy(() => 'nothing on the board');
    listen(this, session().events, 'changed', () => this.refresh());
    listen(this, session().events, 'riceReady', () => {
      audio().play('ding');
      this.flash('rice is ready!');
    });
  }

  protected layoutStation(v: Viewport): void {
    const L = LAYOUT[v.orientation];
    const c = v.content;
    const at = (p: { x: number; y: number }) => ({ x: c.x + p.x, y: c.y + p.y });
    this.cookerPos = { ...at(L.cooker), scale: L.cooker.scale };
    this.cookerImg.setPosition(this.cookerPos.x, this.cookerPos.y).setScale(L.cooker.scale);
    this.cookBtn.setPosition(c.x + L.cook.x, c.y + L.cook.y).setScale(L.cook.scale);
    this.status.setPosition(c.x + L.status.x, c.y + L.status.y);
    this.water.setPosition(c.x + L.water.x, c.y + L.water.y);
    this.boardPos = { ...at(L.board), r: L.board.r };
    this.boardZone.setPosition(this.boardPos.x, this.boardPos.y).setSize(L.board.r * 2.6, L.board.r * 2.4);
    if (this.boardZone.input) this.boardZone.input.hitArea.setTo(0, 0, L.board.r * 2.6, L.board.r * 2.4);
    this.noriHome = at(L.nori);
    this.nori.setPosition(this.noriHome.x, this.noriHome.y);
    this.scoop.setPosition(c.x + L.scoop.x, c.y + L.scoop.y);
    this.press.setPosition(c.x + L.press.x, c.y + L.press.y);
    this.done.setPosition(c.x + L.done.x, c.y + L.done.y);
    this.toss.setPosition(c.x + L.toss.x, c.y + L.toss.y);
    this.metersPos = { ...at(L.meters), w: L.meters.w };
    this.meterLabels.forEach((l, i) => l.setPosition(this.metersPos.x - 12, this.metersPos.y + i * 40));
    const t = L.tools;
    this.tools.forEach((tool, i) => {
      const x = c.x + t.x + i * t.step;
      const y = c.y + t.y;
      tool.zone.setPosition(x, y).setSize(t.size + 20, t.size + 20);
      if (tool.zone.input) tool.zone.input.hitArea.setTo(0, 0, t.size + 20, t.size + 20);
      tool.label.setPosition(x, y + t.size / 2 + 12);
    });
    const pk = L.packer;
    this.packer.layout({ ready: { ...pk.ready, ...at(pk.ready) }, box: { ...pk.box, ...at(pk.box) }, close: { ...pk.close, ...at(pk.close) }, hint: { ...pk.hint, ...at(pk.hint) } });
    this.flashText.setPosition(c.x + L.flash.x, c.y + L.flash.y);
    this.refresh();
  }

  // ---- State → screen ----------------------------------------------------------

  private refresh(): void {
    const s = session();
    const r = s.riceStation;
    const o = r.board;
    this.packer.refresh();
    this.cookBtn.setEnabled(r.cooker !== 'cooking' && r.portions === 0);
    this.scoop.setEnabled(!o ? r.cooker === 'ready' && r.portions > 0 : o.presses.length === 0);
    this.press.setEnabled(!!o && o.nori === null);
    this.done.setEnabled(!!o);
    this.toss.setEnabled(!!o);
    this.nori.setAlpha(o && o.nori === null ? 1 : 0.45);
    this.drawTools();
    const rice = s.stockOf('rice');
    const nori = s.stockOf('nori');
    this.setSubtitle(Number.isFinite(rice) ? `rice: ${rice} pots · nori: ${nori}` : 'make onigiri for the orders');
  }

  private drawTools(): void {
    const g = this.toolArt;
    const m = menu.sides?.onigiri;
    const s = session();
    g.clear();
    for (const tool of this.tools) {
      const x = tool.zone.x;
      const y = tool.zone.y;
      const r = tool.zone.width / 2 - 14;
      const out = s.stockOf(tool.kind === 'filling' ? fillingStockId(tool.id) : sideToppingStockId(tool.id)) < 1;
      const chosen = tool.kind === 'filling' && this.armed === tool.id;
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
        }
      } else {
        m?.toppings
          .find((x) => x.id === tool.id)
          ?.colors.forEach((c, i) => {
            g.fillStyle(parseInt(c.slice(1), 16), out ? 0.3 : 1);
            for (let j = 0; j < 6; j++) g.fillCircle(x + Math.cos(i * 2 + j * 1.1) * r * 0.5, y + Math.sin(i * 2 + j * 1.1) * r * 0.5, 6);
          });
      }
      tool.label.setColor(out ? '#ff9a8a' : CSS.cream);
    }
  }

  override update(): void {
    const r = session().riceStation;
    const st =
      r.cooker === 'cooking'
        ? `cooking… ${clockText(r.cookLeft * 1000)}`
        : r.cooker === 'ready' && r.portions > 0
          ? `rice ready: ${r.portions} left`
          : 'the pot is empty:\nset the water, cook';
    if (st !== this.shownStatus) {
      this.shownStatus = st;
      this.status.setText(st);
      this.refresh();
    }
    this.drawCooker();
    this.drawBoard();
    this.drawMeters();
  }

  private drawCooker(): void {
    const g = this.cookerArt;
    const r = session().riceStation;
    const { x, y, scale } = this.cookerPos;
    g.clear();
    // A water gauge beside the pot: the rice line (green) and where the slider's set.
    const gx = x + 175 * scale;
    const top = y - 80 * scale;
    const h = 180 * scale;
    const ideal = balance.rice.cooker.water.ideal;
    g.fillStyle(0x2b2522);
    g.fillRoundedRect(gx - 14, top, 28, h, 10);
    g.fillStyle(GOOD, 0.7);
    g.fillRect(gx - 14, top + h * (1 - ideal.max), 28, h * (ideal.max - ideal.min));
    const showing = r.cooker === 'empty' || (r.cooker === 'ready' && r.portions === 0) ? this.waterLevel : null;
    if (showing !== null) {
      g.fillStyle(0x6ec6ff);
      g.fillRoundedRect(gx - 8, top + h * (1 - showing), 16, h * showing, 6);
    }
    g.lineStyle(4, COLORS.ink);
    g.strokeRoundedRect(gx - 14, top, 28, h, 10);
    // Steam while it cooks.
    if (r.cooker === 'cooking') {
      const t = this.time.now / 600;
      g.fillStyle(0xffffff, 0.35);
      for (let i = 0; i < 3; i++) g.fillCircle(x - 30 * scale + i * 30 * scale, y - 130 * scale - ((t + i * 0.33) % 1) * 60 * scale, 14 * scale);
    }
  }

  private drawBoard(): void {
    const g = this.boardArt;
    const s = session();
    const { x, y, r } = this.boardPos;
    g.clear();
    // The cutting board.
    g.fillStyle(0x000000, 0.25);
    g.fillRoundedRect(x - r * 1.3 + 8, y - r * 1.15 + 12, r * 2.6, r * 2.3, 28);
    g.fillStyle(0xd9b98c);
    g.fillRoundedRect(x - r * 1.3, y - r * 1.15, r * 2.6, r * 2.3, 28);
    g.lineStyle(6, COLORS.ink);
    g.strokeRoundedRect(x - r * 1.3, y - r * 1.15, r * 2.6, r * 2.3, 28);
    const o = s.riceStation.board;
    if (!o) {
      g.lineStyle(3, 0xffffff, 0.4);
      g.strokeCircle(x, y, r * 0.6);
      return;
    }
    drawOnigiri(g, x, y, r, o, menu.sides?.onigiri, balance.rice.press.count);
    // While a filling's picked: a target in the middle.
    if (this.armed && o.presses.length === 0) {
      g.lineStyle(4, COLORS.pink, 0.9);
      g.strokeCircle(x, y, r * 0.15);
    }
  }

  private drawMeters(): void {
    const g = this.meterArt;
    g.clear();
    const o = session().riceStation.board;
    for (const l of this.meterLabels) l.setVisible(!!o);
    if (!o) return;
    const b = balance.rice;
    const { x, y, w } = this.metersPos;
    // Rice scooped.
    g.fillStyle(0x2b2522);
    g.fillRoundedRect(x, y - 10, w, 20, 10);
    g.fillStyle(GOOD, 0.5);
    g.fillRect(x + (w * b.scoop.ideal.min) / METER_MAX, y - 10, (w * (b.scoop.ideal.max - b.scoop.ideal.min)) / METER_MAX, 20);
    g.fillStyle(o.rice > b.scoop.ideal.max ? OVER : o.rice >= b.scoop.ideal.min ? GOOD : LOW);
    g.fillRoundedRect(x, y - 6, Math.max(8, Math.min(w, (w * o.rice) / METER_MAX)), 12, 6);
    // Presses: a dot each, coloured by how good it was; the one being held fills up.
    const n = b.press.count;
    for (let i = 0; i < Math.max(n, o.presses.length); i++) {
      const px = x + 20 + i * 50;
      const py = y + 40;
      const sec = o.presses[i];
      g.fillStyle(sec === undefined ? 0x2b2522 : i >= n ? OVER : rangeScore(sec, b.press.idealSec, b.press.zeroAt) >= 0.8 ? GOOD : LOW);
      g.fillCircle(px, py, 16);
      g.lineStyle(3, COLORS.ink);
      g.strokeCircle(px, py, 16);
    }
    if (this.press.isHeld) {
      const held = (session().timeMs - this.pressStart) / 1000;
      const bx = x + 20 + Math.max(n, o.presses.length) * 50;
      g.fillStyle(held > b.press.idealSec.max ? OVER : held >= b.press.idealSec.min ? GOOD : LOW);
      g.fillCircle(bx, y + 40, 8 + Math.min(14, held * 14));
    }
  }

  // ---- Actions ----------------------------------------------------------------

  private cook(): void {
    const r = session().startRice(this.waterLevel);
    if (r === 'none') this.flash('out of rice!\nbuy more at the store');
    else if (r === 'ok') audio().play('pour');
  }

  private checkScoop(): void {
    const r = session().riceStation;
    if (!r.board && !(r.cooker === 'ready' && r.portions > 0)) this.flash(r.cooker === 'cooking' ? 'the rice is still cooking' : 'cook some rice first');
  }

  private pickFilling(id: string): void {
    const o = session().riceStation.board;
    if (!o) return this.flash('scoop some rice first');
    if (o.presses.length) return this.flash('the filling goes in before you press it');
    if (session().stockOf(fillingStockId(id)) < 1) return this.flash('out of that filling!');
    this.armed = id;
    audio().play('tap');
    this.drawTools();
  }

  private tapBoard(px: number, py: number): void {
    const s = session();
    const o = s.riceStation.board;
    if (!o) return;
    if (!this.armed) {
      if (!o.filling) this.flash('pick a filling, then tap\nthe middle of the rice');
      return;
    }
    const { x, y, r } = this.boardPos;
    const offset = Phaser.Math.Distance.Between(px, py, x, y) / (r * 0.8);
    const res = s.setOnigiriFilling(this.armed, offset);
    if (res === 'none') this.flash('out of that filling!');
    else if (res === 'ok') audio().play('drop');
    this.armed = null;
    this.drawTools();
  }

  private pressChange(held: boolean): void {
    const s = session();
    if (held) {
      this.pressStart = s.timeMs;
      if (!s.riceStation.board) this.flash('scoop some rice first');
      return;
    }
    const o = s.riceStation.board;
    if (!o || o.nori !== null) return;
    if (!o.filling) this.flash('no filling? it goes in before pressing');
    s.pressOnigiri((s.timeMs - this.pressStart) / 1000);
    this.armed = null;
  }

  private addTopping(id: string): void {
    const r = session().addOnigiriTopping(id);
    if (r === 'none') this.flash('out of that one!');
    else if (r === 'no') this.flash('scoop some rice first');
    else audio().play('shake');
  }

  private dropNori(): void {
    const s = session();
    const { x, y, r } = this.boardPos;
    const nx = this.nori.x;
    const ny = this.nori.y;
    const onBoard = Math.abs(nx - x) < r * 1.3 && Math.abs(ny - y) < r * 1.2;
    if (onBoard && s.riceStation.board) {
      const res = s.wrapNori(Math.abs(nx - x) / r);
      if (res === 'none') this.flash('out of nori!');
      else if (res === 'no') this.flash('it already has its nori');
      else audio().play('flip');
    }
    this.tweens.add({ targets: this.nori, x: this.noriHome.x, y: this.noriHome.y, duration: 200 });
  }

  private finish(): void {
    const s = session();
    const o = s.riceStation.board;
    if (!o) return;
    if (s.riceStation.trayFull) return this.flash('the tray is full!\npack some first');
    const done = s.finishOnigiri();
    if (done) {
      audio().play('tap');
      popScore(this, this.boardPos.x, this.boardPos.y - this.boardPos.r, s.sideQualityOf('onigiri', done));
    }
  }

  private tossIt(): void {
    if (session().trashOnigiri()) audio().play('trash');
    this.armed = null;
  }

  private flash(text: string): void {
    this.tweens.killTweensOf(this.flashText);
    this.flashText.setText(text).setVisible(true).setAlpha(1);
    this.tweens.add({ targets: this.flashText, alpha: 0, delay: 1300, duration: 400, onComplete: () => this.flashText.setVisible(false) });
  }
}
