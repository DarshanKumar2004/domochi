import Phaser from 'phaser';
import { audio, balance, menu, save, stickers } from '../systems/services';
import { flavorsForDay } from '../systems/menu';
import { fillStock, glazeStockId, priceOn, shopNeeds, shoppingPlan, toppingStockId, type ShopPick, type SupplyItem } from '../systems/supplies';
import { TextureKeys } from '../assets/keys';
import type { DecorItem } from '../systems/balance';
import type { Hire } from '../systems/staff';
import { showJoinTeam } from '../ui/HomePanels';
import { Button } from '../ui/Button';
import { beginOverlay } from '../ui/overlay';
import { COLORS, CSS, FONT_FAMILY } from '../ui/theme';
import { hexToNumber } from '../ui/DonutIcon';
import type { Viewport } from '../ui/layout';
import { onLayout } from '../ui/viewport';
import { startMainGame, stopMainGame } from './flow';
import { SceneKeys } from './sceneKeys';

const TILE_H = 250;
const GAP = 18;
/** Header (title, cash, mochi's tip) and footer (Open day) heights, design px. */
const HEAD = 290;
const FOOT = 240;
/** mochi's colours by priority: must (pink, as is), should (gold), nice to have (grey). */
const BADGE_TINT = { 1: 0xffffff, 2: 0xffd27a, 3: 0xbdb6ae } as const;

/** A finger that moves this far is scrolling, not tapping. */
const DRAG_PX = 14;

/** How a tile looks: its section's colour, and a little picture of the item. */
interface Look {
  accent: number;
  icon?: { key: string; tint?: number };
  /** Not in the store yet: a mystery tile (no name, no picture). */
  locked?: boolean;
}

interface Tile {
  /** Supply id (guides have none). */
  id?: string;
  look: Look;
  title: Phaser.GameObjects.Text;
  icon: Phaser.GameObjects.Image | Phaser.GameObjects.Text;
  /** mochi sitting on the tile when it's one of mochi's picks. */
  badge?: Phaser.GameObjects.Image;
  badgeText?: Phaser.GameObjects.Text;
  box: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Graphics;
  have: Phaser.GameObjects.Text;
  buy: Button;
  refresh: () => void;
}

/** A heading (on a band of its colour), then its tiles. */
interface Section {
  label: Phaser.GameObjects.Text;
  band: Phaser.GameObjects.Graphics;
  accent: number;
  tiles: Tile[];
}

const money = (n: number) => `$${n.toFixed(2)}`;

/** The store's sections, by supply kind. */
const SECTIONS: { title: string; kinds: SupplyItem['kind'][]; accent: number }[] = [
  { title: 'dough & oil', kinds: ['ingredient', 'oil'], accent: 0xe9c48f },
  { title: 'boxes', kinds: ['box'], accent: 0xd8b58a },
  { title: 'glazes & toppings', kinds: ['glaze', 'topping'], accent: 0xf4a6c0 },
];
const ACCENT = { guides: 0xc9b8ec, decor: 0xa8d8a0, crew: 0xa8c8ec } as const;

/** A little picture of a supply: its bin, cup, jar or box (tinted like the real thing). */
function supplyIcon(it: SupplyItem): Look['icon'] {
  const ing = balance.dough.ingredients.find((i) => i.id === it.id);
  if (ing) return { key: TextureKeys.IngredientBin, tint: hexToNumber(ing.color) };
  if (it.kind === 'oil') return { key: TextureKeys.IngredientBin, tint: 0xf2c14e };
  if (it.kind === 'box') return { key: TextureKeys.DonutBox };
  if (it.kind === 'glaze') {
    const g = menu.glazes.find((x) => glazeStockId(x.id) === it.id);
    return { key: TextureKeys.GlazeCup, ...(g ? { tint: hexToNumber(g.color) } : {}) };
  }
  return { key: TextureKeys.ToppingJar };
}

/**
 * The supply store, between days: packs of dough ingredients, boxes, oil,
 * glazes and toppings (prices change from day to day; new flavours' glazes
 * and toppings come in on their unlock day), and glaze guides (bought once).
 * The list scrolls (drag, or the mouse wheel); spending comes out of the cash
 * you've banked.
 */
export class StoreScene extends Phaser.Scene {
  private tiles: Tile[] = [];
  /** mochi's latest shopping plan (the tiles' "low!" and badges follow it). */
  private currentPlan: ShopPick[] = [];
  private cash!: Phaser.GameObjects.Text;
  /** mochi's shopping tip: what you're short of for a day. */
  private tip!: Phaser.GameObjects.Text;
  private list!: Phaser.GameObjects.Container;
  private scroll = 0;
  private maxScroll = 0;
  private listTop = 0;
  private listScale = 1;
  /** Where the scrolling area starts and ends on screen (things past the footer are hidden). */
  private footTop = 0;
  /** Dragging the list (taps don't buy while scrolling). */
  private drag: { y: number; scroll: number; moved: boolean } | null = null;
  private dragged = false;

  constructor() {
    super(SceneKeys.Store);
  }

  create(): void {
    beginOverlay(this, 0.75);
    this.tiles = [];
    this.scroll = 0;
    this.drag = null;
    this.dragged = false;
    const day = save().data.day;
    this.list = this.add.container(0, 0);
    const text = (size: number, color: string = CSS.ink, bold = false) =>
      this.add.text(0, 0, '', { fontFamily: FONT_FAMILY, fontSize: `${size}px`, fontStyle: bold ? 'bold' : 'normal', color, align: 'center' }).setOrigin(0.5);
    const section = (s: string, accent: number, tiles: Tile[]): Section => {
      const band = this.add.graphics();
      const t = text(34, CSS.ink, true).setText(s);
      this.list.add([band, t]);
      return { label: t, band, accent, tiles };
    };

    const sections: Section[] = [];
    for (const sec of SECTIONS) {
      const tiles = balance.supplies.items.filter((it) => sec.kinds.includes(it.kind)).map((it) => this.supplyTile(it, day, sec.accent));
      sections.push(section(sec.title, sec.accent, tiles));
    }
    sections.push(section('glaze guides: dashed lines that show you where to pour', ACCENT.guides, balance.guides.items.map((g) => this.guideTile(g))));
    sections.push(section('decorations for the lot (each gives a little perk)', ACCENT.decor, balance.decor.items.map((d) => this.decorTile(d, day))));
    sections.push(section("your crew: they keep the trailer going while you're away", ACCENT.crew, balance.staff.hires.map((h) => this.hireTile(h, day))));

    // Header and footer sit over the list (and catch taps there), so it scrolls under them.
    const card = this.add.graphics();
    this.list.setDepth(1); // above the card (and the dimmer)
    const head = this.add.graphics().setDepth(10);
    const foot = this.add.graphics().setDepth(10);
    const headZone = this.add.zone(0, 0, 1, 1).setOrigin(0).setInteractive().setDepth(10);
    const footZone = this.add.zone(0, 0, 1, 1).setOrigin(0).setInteractive().setDepth(10);
    const title = text(64, CSS.ink, true).setText('supply store').setDepth(11);
    const sub = text(32, '#6b5d52').setText(`day ${day} prices · stock up before you open`).setDepth(11);
    this.cash = text(44, CSS.ink, true).setName('store-cash').setDepth(11);
    this.tip = text(32, '#b0406a', true).setName('store-tip').setDepth(11);
    const start = new Button(this, 0, 0, `Open day ${day}`, () => this.openDay(), { width: 560, name: 'btn-store-done' }).setDepth(11);
    const hint = text(26, '#6b5d52').setText('scroll for more ↓').setDepth(11);
    this.refresh();

    // Scrolling: drag anywhere on the list, or the mouse wheel.
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      this.drag = { y: p.y, scroll: this.scroll, moved: false };
      this.dragged = false;
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (!this.drag || !p.isDown) return;
      const dy = p.y - this.drag.y;
      if (Math.abs(dy) > DRAG_PX) this.drag.moved = this.dragged = true;
      if (this.drag.moved) this.scrollTo(this.drag.scroll - dy / this.listScale);
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, () => (this.drag = null));
    this.input.on(Phaser.Input.Events.POINTER_WHEEL, (_p: unknown, _o: unknown, _dx: number, dy: number) => this.scrollTo(this.scroll + dy));

    onLayout(this, (v: Viewport) => {
      const L = v.orientation === 'landscape';
      const cols = L ? 5 : 2;
      const tileW = L ? 330 : 470;
      const w = cols * tileW + (cols - 1) * GAP + 80;
      // The card fills the screen's height; the list scrolls inside it.
      const scale = Math.min(1, (v.width - 30) / w);
      const h = (v.height - 30) / scale;
      const cx = v.width / 2;
      const top = 15;
      const at = (y: number) => top + y * scale;
      this.listScale = scale;

      card.clear();
      card.fillStyle(0x000000, 0.25);
      card.fillRoundedRect(cx - (w * scale) / 2, top + 12, w * scale, h * scale, 48 * scale);
      card.fillStyle(COLORS.card);
      card.fillRoundedRect(cx - (w * scale) / 2, top, w * scale, h * scale, 48 * scale);
      const left = cx - (w * scale) / 2;
      head.clear().fillStyle(COLORS.card).fillRoundedRect(left, top, w * scale, HEAD * scale, { tl: 48 * scale, tr: 48 * scale, bl: 0, br: 0 });
      foot.clear().fillStyle(COLORS.card).fillRoundedRect(left, at(h - FOOT), w * scale, FOOT * scale, { tl: 0, tr: 0, bl: 48 * scale, br: 48 * scale });
      head.lineStyle(3, COLORS.ink, 0.12).lineBetween(left + 30, at(HEAD), left + w * scale - 30, at(HEAD));
      foot.lineStyle(3, COLORS.ink, 0.12).lineBetween(left + 30, at(h - FOOT), left + w * scale - 30, at(h - FOOT));
      headZone.setPosition(left, top).setSize(w * scale, HEAD * scale);
      footZone.setPosition(left, at(h - FOOT)).setSize(w * scale, FOOT * scale);
      title.setPosition(cx, at(70)).setScale(scale);
      sub.setPosition(cx, at(130)).setScale(scale);
      this.cash.setPosition(cx, at(185)).setScale(scale);
      this.tip.setPosition(cx, at(240)).setScale(scale).setWordWrapWidth(w - 100);
      start.setPosition(cx, at(h - 105)).setScale(scale);
      hint.setPosition(cx, at(h - FOOT + 22)).setScale(scale);

      // The list, in list coordinates (y from the top of the scrolling area), scaled like the card.
      let y = 30;
      for (const sec of sections) {
        sec.label.setPosition(0, y).setWordWrapWidth(w - 120);
        const lw = sec.label.width + 56;
        const lh = sec.label.height + 14;
        sec.band.clear().fillStyle(sec.accent, 0.55).fillRoundedRect(-lw / 2, y - lh / 2, lw, lh, lh / 2);
        y += 56;
        sec.tiles.forEach((t, i) => {
          const col = i % cols;
          const row = Math.floor(i / cols);
          t.box.setPosition((col - (cols - 1) / 2) * (tileW + GAP), y + row * (TILE_H + GAP) + TILE_H / 2);
          this.drawTile(t, tileW);
          t.badge?.setPosition(tileW / 2 - 36, -TILE_H / 2 + 40);
          t.badgeText?.setPosition(tileW / 2 - 36, -TILE_H / 2 + 82);
        });
        y += Math.ceil(sec.tiles.length / cols) * (TILE_H + GAP) + 20;
      }
      const viewH = h - HEAD - FOOT;
      this.maxScroll = Math.max(0, y - viewH);
      hint.setVisible(this.maxScroll > 0);
      this.listTop = at(HEAD);
      this.footTop = at(h - FOOT);
      this.list.setScale(scale).setX(cx);
      this.scrollTo(this.scroll);
    });
  }

  private scrollTo(s: number): void {
    this.scroll = Phaser.Math.Clamp(s, 0, this.maxScroll);
    this.list.setY(this.listTop - this.scroll * this.listScale);
    // Anything starting below the footer's top is hidden (the footer is taller than a tile,
    // so nothing peeks out under the card); the header covers what scrolls up past it.
    const half = (TILE_H / 2) * this.listScale;
    for (const o of this.list.list as unknown as (Phaser.GameObjects.Components.Visible & { y: number })[]) {
      const mid = this.list.y + o.y * this.listScale;
      o.setVisible(mid - half < this.footTop && mid + half > this.listTop);
    }
  }

  /** A pack of a supply: greyed out until the day it comes in. */
  private supplyTile(it: SupplyItem, day: number, accent: number): Tile {
    const price = priceOn(it, day, balance.supplies.priceSwing);
    const swing = price / it.price - 1;
    const trend = swing > 0.08 ? '  ▲' : swing < -0.08 ? '  ▼' : '';
    const from = it.unlockDay ?? 1;
    const locked = from > day;
    const tile = this.makeTile(`store-${it.id}`, it.name, locked ? 'coming soon' : `+${it.pack} · ${money(price)}${trend}`, () => {
      if (locked) return { label: 'comes in later', low: false, can: false, owned: false };
      const have = this.stock()[it.id] ?? 0;
      // "low!" = mochi wants more of it for tomorrow (a must or a should).
      const low = this.currentPlan.some((p) => p.id === it.id && p.priority <= 2);
      return { label: `have ${have}`, low, can: save().data.money >= price, owned: false };
    }, () => {
      void save().update((d) => {
        const stock = fillStock(d.stock, balance.supplies);
        stock[it.id] = (stock[it.id] ?? 0) + it.pack;
        d.stock = stock;
        d.money = Math.round((d.money - price) * 100) / 100;
      });
    }, { accent, icon: supplyIcon(it), locked });
    tile.id = it.id;
    tile.badge = this.add.image(0, 0, TextureKeys.Mascot).setScale(0.32).setVisible(false).setName(`store-pick-${it.id}`);
    tile.badgeText = this.add
      .text(0, 0, '', { fontFamily: FONT_FAMILY, fontSize: '24px', fontStyle: 'bold', color: '#fbf6ec', backgroundColor: '#b0406a', padding: { x: 6, y: 1 } })
      .setOrigin(0.5)
      .setVisible(false);
    tile.box.add([tile.badge, tile.badgeText]);
    return tile;
  }

  /** A decoration: bought once, from its day; shows in the lot with a small perk. */
  private decorTile(d: DecorItem, day: number): Tile {
    const locked = d.unlockDay > day;
    const tile = this.makeTile(`store-decor-${d.id}`, d.name, locked ? 'coming soon' : money(d.price), () => {
      if (locked) return { label: 'comes in later', low: false, can: false, owned: false };
      const owned = save().data.decor.includes(d.id);
      return { label: owned ? 'on the lot ✓' : d.desc, low: false, can: !owned && save().data.money >= d.price, owned };
    }, () => {
      void save().update((s) => {
        if (s.decor.includes(d.id)) return;
        s.decor.push(d.id);
        s.money = Math.round((s.money - d.price) * 100) / 100;
      });
    }, { accent: ACCENT.decor, icon: { key: TextureKeys.Planter }, locked });
    return tile;
  }

  /** Hire someone (once, from their day): more made while you're away. */
  private hireTile(h: Hire, day: number): Tile {
    const locked = h.unlockDay > day;
    if (h.player) return this.joinTile(h, locked);
    const tile = this.makeTile(`store-hire-${h.id}`, `hire ${h.name}`, locked ? 'coming soon' : money(h.price), () => {
      if (locked) return { label: 'comes in later', low: false, can: false, owned: false };
      const owned = save().data.staff.includes(h.id);
      return { label: owned ? 'on the crew ✓' : `up to +$${h.capAdd} while away`, low: false, can: !owned && save().data.money >= h.price, owned };
    }, () => {
      void save().update((s) => {
        if (s.staff.includes(h.id)) return;
        s.staff.push(h.id);
        s.money = Math.round((s.money - h.price) * 100) / 100;
        s.lastSeen = Date.now(); // they start from now
      });
    }, { accent: ACCENT.crew, icon: { key: TextureKeys.CustomerRegular }, locked });
    return tile;
  }

  /** The last place on the crew is yours: mochi asks your name and invites you on. */
  private joinTile(h: Hire, locked: boolean): Tile {
    const tile = this.makeTile(`store-hire-${h.id}`, 'join the team!', locked ? 'coming soon' : 'join', () => {
      if (locked) return { label: 'mochi has an idea...', low: false, can: false, owned: false };
      const owned = save().data.staff.includes(h.id);
      return { label: owned ? `${save().data.playerName || 'you'}: on the crew ✓` : 'Ethan would love to have you', low: false, can: !owned, owned };
    }, () => {
      const tex = this.textures.get(TextureKeys.Mascot).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
      const c = document.createElement('canvas');
      c.width = tex.width;
      c.height = tex.height;
      c.getContext('2d')!.drawImage(tex, 0, 0);
      showJoinTeam(c.toDataURL('image/png'), (name) => {
        const n = name.trim().slice(0, 24);
        if (!n) return false;
        void save().update((s) => {
          s.playerName = n;
          if (!s.staff.includes(h.id)) s.staff.push(h.id);
          s.lastSeen = Date.now();
        });
        audio().play('fanfare');
        this.refresh();
        return true;
      });
    }, { accent: ACCENT.crew, icon: { key: TextureKeys.Mascot }, locked });
    return tile;
  }

  private guideTile(g: { id: string; name: string; price: number }): Tile {
    const flavor = menu.flavors.find((f) => f.id === g.id);
    const name = g.id === 'base' ? 'base coat' : (flavor?.name ?? g.id);
    return this.makeTile(`store-guide-${g.id}`, name, money(g.price), () => {
      const owned = save().data.guides.includes(g.id);
      return { label: owned ? 'yours ✓' : g.id === 'base' ? 'loops for every glaze' : 'drizzle stripes', low: false, can: !owned && save().data.money >= g.price, owned };
    }, () => {
      void save().update((d) => {
        if (d.guides.includes(g.id)) return;
        d.guides.push(g.id);
        d.money = Math.round((d.money - g.price) * 100) / 100;
      });
      stickers()?.checkGuides();
    }, { accent: ACCENT.guides, icon: { key: TextureKeys.IconGlaze, tint: 0x8a6fc9 } });
  }

  /** mochi's tip from the plan: what to get first, and what's short if money's tight. */
  private shoppingTip(plan: readonly ShopPick[]): string {
    const name = (id: string) => balance.supplies.items.find((i) => i.id === id)?.name ?? id;
    const list = (ids: string[]) => (ids.length > 3 ? `${ids.slice(0, 3).join(', ')} and more` : ids.join(', '));
    const short = plan.filter((p) => !p.affordable).map((p) => name(p.id));
    const first = plan.filter((p) => p.affordable && p.priority === 1).map((p) => name(p.id));
    const then = plan.filter((p) => p.affordable && p.priority > 1).map((p) => name(p.id));
    if (short.length) return first.length ? `money's tight! get ${list(first)} first. still short: ${list(short)}` : `money's tight... we can't afford ${list(short)} yet`;
    if (first.length) return `mochi says: get ${list(first)} first${then.length ? `, then ${list(then)}` : ''}!`;
    if (then.length) return `mochi says: nice to have: ${list(then)}`;
    return "mochi says: you're all set for tomorrow!";
  }

  private stock(): Record<string, number> {
    return fillStock(save().data.stock, balance.supplies);
  }

  /** One thing for sale: its name, what you have, and a buy button. */
  private makeTile(
    name: string,
    label: string,
    buyLabel: string,
    state: () => { label: string; low: boolean; can: boolean; owned: boolean },
    buy: () => void,
    look: Look,
  ): Tile {
    const bg = this.add.graphics();
    // Not here yet: no name or picture, just a "?" (no spoilers).
    const title = this.add
      .text(0, -72, look.locked ? 'coming soon' : label, { fontFamily: FONT_FAMILY, fontSize: '32px', fontStyle: 'bold', color: look.locked ? '#8a7b70' : CSS.ink })
      .setOrigin(0, 0.5);
    const icon = look.locked
      ? this.add.text(0, -52, '?', { fontFamily: FONT_FAMILY, fontSize: '64px', fontStyle: 'bold', color: '#8a7b70' }).setOrigin(0.5)
      : this.add.image(0, -52, look.icon?.key ?? TextureKeys.Mascot).setTint(look.icon?.tint ?? 0xffffff);
    const have = this.add.text(0, -36, '', { fontFamily: FONT_FAMILY, fontSize: '28px', color: '#6b5d52' }).setOrigin(0, 0.5).setName(`${name}-have`);
    const btn = new Button(
      this,
      0,
      56,
      look.locked ? 'locked' : buyLabel,
      () => {
        // A finger that was scrolling the list isn't buying.
        if (this.dragged) return;
        buy();
        audio().play('cash');
        this.refresh();
      },
      { width: 290, height: 120, fontSize: 34, name },
    );
    const box = this.add.container(0, 0, [bg, icon, title, have, btn]);
    this.list.add(box);
    const tile: Tile = {
      look,
      title,
      icon,
      box,
      bg,
      have,
      buy: btn,
      refresh: () => {
        if (look.locked) {
          have.setText('');
          btn.setEnabled(false);
          return;
        }
        const s = state();
        have.setText(s.low ? `${s.label} · low!` : s.label).setColor(s.low ? '#b0406a' : '#6b5d52');
        btn.setEnabled(s.can);
        if (s.owned) btn.setAlpha(0.3);
      },
    };
    this.tiles.push(tile);
    return tile;
  }

  /** A tile: white card with its section's band along the top, the picture, the name and count, and the buy button. */
  private drawTile(t: Tile, tileW: number): void {
    const g = t.bg;
    const half = TILE_H / 2;
    g.clear();
    g.fillStyle(0x000000, 0.08);
    g.fillRoundedRect(-tileW / 2 + 4, -half + 6, tileW, TILE_H, 26);
    g.fillStyle(t.look.locked ? 0xf3ede4 : 0xffffff);
    g.fillRoundedRect(-tileW / 2, -half, tileW, TILE_H, 26);
    g.fillStyle(t.look.accent, t.look.locked ? 0.35 : 0.9);
    g.fillRoundedRect(-tileW / 2, -half, tileW, 18, { tl: 26, tr: 26, bl: 0, br: 0 });
    g.lineStyle(3, COLORS.ink, 0.15);
    g.strokeRoundedRect(-tileW / 2, -half, tileW, TILE_H, 26);
    if (t.look.locked) {
      // A dashed circle round the "?".
      g.lineStyle(3, 0x8a7b70, 0.6);
      for (let k = 0; k < 16; k += 2) g.beginPath().arc(-tileW / 2 + 58, -52, 36, (k / 16) * Math.PI * 2, ((k + 1) / 16) * Math.PI * 2).strokePath();
    }
    // The picture on the left, the name and count beside it.
    const ix = -tileW / 2 + 58;
    t.icon.setPosition(ix, -52);
    if (t.icon instanceof Phaser.GameObjects.Image) {
      const fit = 78 / Math.max(t.icon.width, t.icon.height);
      t.icon.setScale(fit);
    }
    const tx = -tileW / 2 + 108;
    t.title.setPosition(tx, -72);
    for (let size = 32; t.title.width > tileW - 124 && size > 18; size -= 2) t.title.setFontSize(size);
    t.have.setPosition(tx, -34);
  }

  private refresh(): void {
    this.cash.setText(`cash ${money(save().data.money)}`);
    const plan = this.plan();
    this.currentPlan = plan;
    this.tip.setText(this.shoppingTip(plan));
    for (const t of this.tiles) {
      t.refresh();
      // mochi sits on each pick, coloured by how much it matters, with how many packs.
      const pick = plan.find((p) => p.id === t.id && p.affordable) ?? plan.find((p) => p.id === t.id);
      t.badge?.setVisible(!!pick);
      t.badgeText?.setVisible(!!pick);
      if (pick && t.badge && t.badgeText) {
        t.badge.setTint(BADGE_TINT[pick.priority]);
        t.badgeText.setText(pick.affordable ? `×${pick.packs}` : 'need!').setBackgroundColor(pick.affordable ? '#b0406a' : '#7a2e2e');
      }
    }
  }

  /** mochi's shopping list for today's cash (see shoppingPlan). */
  private plan(): ShopPick[] {
    const day = save().data.day;
    const onMenu = new Set<string>();
    for (const f of flavorsForDay(menu, day)) {
      if (f.glaze) onMenu.add(glazeStockId(f.glaze));
      if (f.drizzle) onMenu.add(glazeStockId(f.drizzle));
      for (const tp of f.toppings ?? []) onMenu.add(toppingStockId(tp));
    }
    const needs = shopNeeds(balance.supplies, balance.dough.recipe, onMenu, day);
    const priceOf = (id: string) => {
      const it = balance.supplies.items.find((i) => i.id === id)!;
      return priceOn(it, day, balance.supplies.priceSwing);
    };
    return shoppingPlan(balance.supplies, needs, this.stock(), save().data.money, priceOf);
  }

  private openDay(): void {
    stopMainGame(this);
    startMainGame(this);
  }
}
