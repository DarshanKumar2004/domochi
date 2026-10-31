import Phaser from 'phaser';
import { TextureKeys } from '../assets/keys';
import type { StickerDef } from '../systems/journal';
import { audio, journalData, save } from '../systems/services';
import { Button } from '../ui/Button';
import type { Viewport } from '../ui/layout';
import { beginOverlay } from '../ui/overlay';
import { COLORS, CSS, FONT_FAMILY } from '../ui/theme';
import { onLayout } from '../ui/viewport';
import { SceneKeys } from './sceneKeys';

type Mode = 'pages' | 'stickers';

/** Notebook size (design units, scaled to fit), per orientation. */
const SIZE = { portrait: { w: 1000, h: 1560 }, landscape: { w: 1700, h: 960 } } as const;
const PAPER = 0xfffaf0;
const RULE = 0xbfd7ea;
const MARGIN = 0xf2a0a0;

const money = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(n).toFixed(2)}`;

/**
 * mochi's journal: a notebook with a page for every finished day (mochi's
 * note, a doodle of the day's best donut, the stickers earned that day) and
 * a sticker book of everything there is to earn.
 */
export class JournalScene extends Phaser.Scene {
  private mode: Mode = 'pages';
  private pageIndex = 0;
  private book!: Phaser.GameObjects.Container;
  private viewport: Viewport | null = null;
  /** The sticker whose description is showing (sticker book). */
  private picked: StickerDef | null = null;

  constructor() {
    super(SceneKeys.Journal);
  }

  create(): void {
    beginOverlay(this, 0.7);
    this.mode = 'pages';
    this.picked = null;
    const j = save().data.journal;
    this.pageIndex = Math.max(0, j.pages.length - 1);
    // New stickers get a peek straight away; opening the journal counts as seeing them.
    if (j.stickers.length > j.seen) this.mode = 'stickers';
    void save().update((d) => void (d.journal.seen = d.journal.stickers.length));
    this.book = this.add.container(0, 0).setName('journal-book');
    onLayout(this, (v) => {
      this.viewport = v;
      this.render();
    });
  }

  private get size() {
    return SIZE[this.viewport?.orientation ?? 'portrait'];
  }

  /** Rebuild the notebook (it's small: simpler than keeping every piece in sync). */
  private render(): void {
    const v = this.viewport;
    if (!v) return;
    this.book.removeAll(true);
    const { w, h } = this.size;
    const scale = Math.min(1, (v.height - 30) / h, (v.width - 30) / w);
    this.book.setPosition(v.width / 2, v.height / 2).setScale(scale);

    // Paper: rounded page, faint blue rules, a pink margin, binding rings along the top.
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.3);
    g.fillRoundedRect(-w / 2 + 10, -h / 2 + 16, w, h, 36);
    g.fillStyle(PAPER);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 36);
    g.lineStyle(3, RULE, 0.8);
    for (let y = -h / 2 + 200; y < h / 2 - 30; y += 56) g.lineBetween(-w / 2 + 30, y, w / 2 - 30, y);
    g.lineStyle(4, MARGIN, 0.8);
    g.lineBetween(-w / 2 + 110, -h / 2 + 150, -w / 2 + 110, h / 2 - 20);
    for (let x = -w / 2 + 80; x < w / 2 - 40; x += 90) {
      g.fillStyle(0x2b2522);
      g.fillCircle(x, -h / 2 + 8, 14);
      g.fillStyle(0xd9d4cc);
      g.fillCircle(x, -h / 2 + 8, 7);
    }
    g.lineStyle(6, COLORS.ink, 0.85);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 36);
    this.book.add(g);

    this.book.add(this.text(-w / 2 + 150, -h / 2 + 80, "mochi's journal", 60, { fontStyle: 'bold' }).setOrigin(0, 0.5));
    const mascot = this.add.image(-w / 2 + 70, -h / 2 + 82, TextureKeys.Mascot).setScale(0.42);
    this.book.add(mascot);

    // Tabs and close.
    const tab = (x: number, label: string, mode: Mode) =>
      new Button(this, x, -h / 2 + 80, label, () => this.setMode(mode), {
        width: 230,
        height: 120,
        fontSize: 38,
        fill: this.mode === mode ? COLORS.pink : COLORS.dough,
        name: `journal-tab-${mode}`,
      });
    this.book.add(tab(w / 2 - 520, 'pages', 'pages'));
    this.book.add(tab(w / 2 - 280, 'stickers', 'stickers'));
    this.book.add(
      new Button(this, w / 2 - 80, -h / 2 + 80, '✕', () => this.scene.stop(), { width: 120, height: 120, fontSize: 48, fill: COLORS.dough, name: 'btn-journal-close' }),
    );
    // In portrait the tabs go on their own row, under the title.
    if (v.orientation === 'portrait') {
      const tabs = this.book.list.filter((o) => o.name?.startsWith('journal-tab-')) as Button[];
      tabs[0]!.setPosition(-120, -h / 2 + 210);
      tabs[1]!.setPosition(130, -h / 2 + 210);
    }

    if (this.mode === 'pages') this.renderPage();
    else this.renderStickers();
  }

  private setMode(mode: Mode): void {
    this.mode = mode;
    this.picked = null;
    this.render();
  }

  private text(x: number, y: number, s: string, size: number, opts: Partial<Phaser.Types.GameObjects.Text.TextStyle> = {}): Phaser.GameObjects.Text {
    return this.add.text(x, y, s, { fontFamily: FONT_FAMILY, fontSize: `${size}px`, color: CSS.ink, ...opts });
  }

  // ---- A day's page ----------------------------------------------------------------

  private renderPage(): void {
    const { w, h } = this.size;
    const L = this.viewport?.orientation === 'landscape';
    const pages = save().data.journal.pages;
    const top = -h / 2 + (L ? 170 : 300);
    if (!pages.length) {
      this.book.add(this.add.image(0, top + 260, TextureKeys.Mascot).setScale(1.2));
      this.book.add(
        this.text(0, top + 520, "no pages yet!\nat the end of each day I'll write one,\nwith a doodle of your best donut", 44, { align: 'center', color: '#6b5d52' }).setOrigin(0.5, 0),
      );
      return;
    }
    const page = pages[Math.min(this.pageIndex, pages.length - 1)]!;
    const left = -w / 2 + 150;

    const heading = [`day ${page.day}`, page.weather, page.event ? `pop-up at ${page.event}` : ''].filter(Boolean).join('  ·  ');
    this.book.add(this.text(left, top, heading, 54, { fontStyle: 'bold', color: '#b0406a' }).setName('journal-page-title'));

    // The doodle: the day's best donut, on a little polaroid.
    const dx = L ? -w / 2 + 420 : 0;
    const dy = L ? top + 330 : top + 360;
    const frame = this.add.graphics();
    frame.fillStyle(0x000000, 0.15);
    frame.fillRect(dx - 205, dy - 195, 420, 470);
    frame.fillStyle(0xffffff);
    frame.fillRect(dx - 215, dy - 210, 420, 470);
    frame.lineStyle(3, COLORS.ink, 0.2);
    frame.strokeRect(dx - 215, dy - 210, 420, 470);
    this.book.add(frame.setAngle(L ? -3 : -2));
    if (page.doodle) {
      const key = `journal-doodle-${page.day}`;
      const img = this.add.image(dx - 5, dy - 5, TextureKeys.Mascot).setVisible(false).setName('journal-doodle');
      this.book.add(img);
      const show = () => img.setTexture(key).setDisplaySize(360, 360).setVisible(true);
      if (this.textures.exists(key)) show();
      else {
        this.textures.once(`addtexture-${key}`, () => img.active && show());
        this.textures.addBase64(key, page.doodle);
      }
    } else {
      this.book.add(this.text(dx - 5, dy - 5, 'no donut\ntoday', 40, { align: 'center', color: '#6b5d52' }).setOrigin(0.5));
    }
    this.book.add(this.text(dx - 5, dy + 215, 'best of the day', 30, { fontStyle: 'italic', color: '#6b5d52' }).setOrigin(0.5));

    // The day in numbers, the stickers, and mochi's note.
    const tx = L ? -w / 2 + 720 : left;
    let ty = L ? top + 120 : dy + 330;
    const line = (s: string, size = 40, opts: Partial<Phaser.Types.GameObjects.Text.TextStyle> = {}) => {
      const t = this.text(tx, ty, s, size, { wordWrap: { width: L ? w / 2 + 60 : w - 220 }, ...opts });
      this.book.add(t);
      ty += t.height + 18;
      return t;
    };
    line(`served ${page.served}  ·  best order ${page.best}`);
    if (page.profit !== undefined) line(`profit ${money(page.profit)}`, 40, { color: page.profit < 0 ? '#b03a3a' : CSS.ink });
    ty += 10;
    line(`"${page.note}"`, 44, { fontStyle: 'italic', color: '#4a3f38' }).setName('journal-note');
    line('— mochi', 32, { color: '#b0406a' });
    ty += 10;
    const earned = page.stickers.map((id) => journalData.stickers.find((s) => s.id === id)).filter((s): s is StickerDef => !!s);
    if (earned.length) {
      line(`stickers today:`, 34, { color: '#6b5d52' });
      earned.forEach((st, i) => {
        const col = i % (L ? 6 : 7);
        const row = Math.floor(i / (L ? 6 : 7));
        this.book.add(this.sticker(st, tx + 55 + col * 120, ty + 55 + row * 120, 0.8, true));
      });
    }

    // Turn the page.
    const by = h / 2 - 100;
    const n = pages.length;
    const i = Math.min(this.pageIndex, n - 1);
    const prev = new Button(this, -w / 2 + 290, by, '‹ earlier', () => this.turn(-1), { width: 300, height: 120, fontSize: 40, fill: COLORS.dough, name: 'btn-journal-prev' });
    const next = new Button(this, w / 2 - 230, by, 'later ›', () => this.turn(1), { width: 300, height: 120, fontSize: 40, fill: COLORS.dough, name: 'btn-journal-next' });
    prev.setEnabled(i > 0);
    next.setEnabled(i < n - 1);
    this.book.add([prev, next, this.text(30, by, `page ${i + 1} of ${n}`, 34, { color: '#6b5d52' }).setOrigin(0.5)]);
  }

  private turn(dir: number): void {
    const n = save().data.journal.pages.length;
    const to = Phaser.Math.Clamp(this.pageIndex + dir, 0, n - 1);
    if (to === this.pageIndex) return;
    this.pageIndex = to;
    audio().play('flip');
    this.render();
  }

  // ---- The sticker book --------------------------------------------------------------

  private renderStickers(): void {
    const { w, h } = this.size;
    const L = this.viewport?.orientation === 'landscape';
    const owned = new Set(save().data.journal.stickers);
    const all = journalData.stickers;
    const top = -h / 2 + (L ? 190 : 310);
    this.book.add(
      this.text(-w / 2 + 150, top, `${owned.size} of ${all.length} stickers`, 46, { fontStyle: 'bold', color: '#b0406a' }).setOrigin(0, 0.5).setName('journal-sticker-count'),
    );

    const cols = L ? 10 : 5;
    const cell = L ? 150 : 165;
    const x0 = -((cols - 1) * cell) / 2 + (L ? 20 : 40);
    all.forEach((st, i) => {
      const x = x0 + (i % cols) * cell;
      const y = top + 120 + Math.floor(i / cols) * (cell + 50);
      const has = owned.has(st.id);
      const s = this.sticker(st, x, y, L ? 0.9 : 1, has);
      s.setSize(130, 130).setInteractive({ useHandCursor: true });
      s.on(Phaser.Input.Events.POINTER_UP, () => {
        this.picked = st;
        audio().play('tap');
        this.render();
      });
      this.book.add(s);
      const name = has || !st.secret ? st.name : '???';
      this.book.add(this.text(x, y + 72, name, 24, { align: 'center', color: has ? CSS.ink : '#9a8f86', wordWrap: { width: cell - 10 } }).setOrigin(0.5, 0));
    });

    // What the picked sticker is for.
    const p = this.picked;
    const msg = !p
      ? 'tap a sticker to see how to earn it'
      : owned.has(p.id)
        ? `${p.name}: ${p.desc}. earned!`
        : p.secret
          ? 'a secret sticker... keep playing and see!'
          : `${p.name}: ${p.desc}`;
    this.book.add(
      this.text(0, h / 2 - 110, msg, 40, { align: 'center', wordWrap: { width: w - 200 }, color: p && owned.has(p.id) ? '#3d7a3a' : '#4a3f38' })
        .setOrigin(0.5)
        .setName('journal-sticker-caption'),
    );
  }

  /** A round sticker: white border, its colour, its glyph. Unearned ones are grey outlines. */
  private sticker(st: StickerDef, x: number, y: number, scale: number, has: boolean): Phaser.GameObjects.Container {
    const c = this.add.container(x, y).setScale(scale).setName(`sticker-${st.id}`);
    const g = this.add.graphics();
    if (has) {
      g.fillStyle(0x000000, 0.18);
      g.fillCircle(4, 6, 58);
      g.fillStyle(0xffffff);
      g.fillCircle(0, 0, 58);
      g.fillStyle(Phaser.Display.Color.HexStringToColor(st.color).color);
      g.fillCircle(0, 0, 48);
      g.lineStyle(4, COLORS.ink, 0.8);
      g.strokeCircle(0, 0, 48);
    } else {
      g.lineStyle(4, 0x9a8f86, 0.7);
      // A dashed ring where it'll go.
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
        g.beginPath();
        g.arc(0, 0, 50, a, a + Math.PI / 24);
        g.strokePath();
      }
    }
    const glyph = has || !st.secret ? st.glyph : '?';
    const t = this.text(0, 0, glyph, glyph.length > 1 ? 40 : 52, { fontStyle: 'bold', color: has ? CSS.ink : '#b8aea5' }).setOrigin(0.5);
    c.add([g, t]);
    if (has) c.setAngle(((st.id.length * 37) % 15) - 7); // stuck on a little crooked
    return c;
  }
}
