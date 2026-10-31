import Phaser from 'phaser';
import { audio, balance, menu, save, stickers } from '../systems/services';
import { flavorsForDay } from '../systems/menu';
import { fillStock, glazeStockId, priceOn, shopNeeds, shoppingPlan, toppingStockId, type ShopPick, type SupplyItem } from '../systems/supplies';
import { TextureKeys } from '../assets/keys';
import type { DecorItem } from '../systems/balance';
import type { Hire } from '../systems/staff';
import { Button } from '../ui/Button';
import { beginOverlay } from '../ui/overlay';
import { COLORS, CSS, FONT_FAMILY } from '../ui/theme';
import type { Viewport } from '../ui/layout';
import { onLayout } from '../ui/viewport';
import { startMainGame, stopMainGame } from './flow';
import { SceneKeys } from './sceneKeys';

const TILE_H = 220;
const GAP = 18;
/** Header (title, cash, mochi's tip) and footer (Open day) heights, design px. */
const HEAD = 290;
const FOOT = 240;
/** mochi's colours by priority: must (pink, as is), should (gold), nice to have (grey). */
const BADGE_TINT = { 1: 0xffffff, 2: 0xffd27a, 3: 0xbdb6ae } as const;

/** A finger that moves this far is scrolling, not tapping. */
const DRAG_PX = 14;

interface Tile {
  /** Supply id (guides have none). */
  id?: string;
  /** mochi sitting on the tile when it's one of mochi's picks. */
  badge?: Phaser.GameObjects.Image;
  badgeText?: Phaser.GameObjects.Text;
  box: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Graphics;
  have: Phaser.GameObjects.Text;
  buy: Button;
  refresh: () => void;
}

/** A heading, then its tiles. */
interface Section {
  label: Phaser.GameObjects.Text;
  tiles: Tile[];
}

const money = (n: number) => `$${n.toFixed(2)}`;

/** The store's sections, by supply kind. */
const SECTIONS: { title: string; kinds: SupplyItem['kind'][] }[] = [
  { title: 'dough & oil', kinds: ['ingredient', 'oil'] },
  { title: 'boxes', kinds: ['box'] },
  { title: 'glazes & toppings', kinds: ['glaze', 'topping'] },
];

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
    const label = (s: string) => {
      const t = text(34, '#6b5d52', true).setText(s);
      this.list.add(t);
      return t;
    };

    const sections: Section[] = [];
    for (const sec of SECTIONS) {
      const tiles = balance.supplies.items.filter((it) => sec.kinds.includes(it.kind)).map((it) => this.supplyTile(it, day));
      sections.push({ label: label(sec.title), tiles });
    }
    sections.push({ label: label('glaze guides: dashed lines that show you where to pour'), tiles: balance.guides.items.map((g) => this.guideTile(g)) });
    sections.push({ label: label('decorations for the lot (each gives a little perk)'), tiles: balance.decor.items.map((d) => this.decorTile(d, day)) });
    sections.push({ label: label("your crew: they keep the trailer going while you're away"), tiles: balance.staff.hires.map((h) => this.hireTile(h, day)) });

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
        sec.label.setPosition(0, y).setWordWrapWidth(w - 80);
        y += 50;
        sec.tiles.forEach((t, i) => {
          const col = i % cols;
          const row = Math.floor(i / cols);
          t.box.setPosition((col - (cols - 1) / 2) * (tileW + GAP), y + row * (TILE_H + GAP) + TILE_H / 2);
          t.bg.clear();
          t.bg.fillStyle(0xffffff, 0.7);
          t.bg.fillRoundedRect(-tileW / 2, -TILE_H / 2, tileW, TILE_H, 24);
          t.bg.lineStyle(3, COLORS.ink, 0.15);
          t.bg.strokeRoundedRect(-tileW / 2, -TILE_H / 2, tileW, TILE_H, 24);
          t.badge?.setPosition(-tileW / 2 + 34, -TILE_H / 2 + 30);
          t.badgeText?.setPosition(-tileW / 2 + 34, -TILE_H / 2 + 72);
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
  private supplyTile(it: SupplyItem, day: number): Tile {
    const price = priceOn(it, day, balance.supplies.priceSwing);
    const swing = price / it.price - 1;
    const trend = swing > 0.08 ? '  ▲' : swing < -0.08 ? '  ▼' : '';
    const from = it.unlockDay ?? 1;
    const locked = from > day;
    const tile = this.makeTile(`store-${it.id}`, it.name, locked ? `day ${from}` : `+${it.pack} · ${money(price)}${trend}`, () => {
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
    });
    if (locked) tile.box.setAlpha(0.5);
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
    const tile = this.makeTile(`store-decor-${d.id}`, d.name, locked ? `day ${d.unlockDay}` : money(d.price), () => {
      if (locked) return { label: 'comes in later', low: false, can: false, owned: false };
      const owned = save().data.decor.includes(d.id);
      return { label: owned ? 'on the lot ✓' : d.desc, low: false, can: !owned && save().data.money >= d.price, owned };
    }, () => {
      void save().update((s) => {
        if (s.decor.includes(d.id)) return;
        s.decor.push(d.id);
        s.money = Math.round((s.money - d.price) * 100) / 100;
      });
    });
    if (locked) tile.box.setAlpha(0.5);
    return tile;
  }

  /** Hire someone (once, from their day): more made while you're away. */
  private hireTile(h: Hire, day: number): Tile {
    const locked = h.unlockDay > day;
    const tile = this.makeTile(`store-hire-${h.id}`, `hire ${h.name}`, locked ? `day ${h.unlockDay}` : money(h.price), () => {
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
    });
    if (locked) tile.box.setAlpha(0.5);
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
    });
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
  ): Tile {
    const bg = this.add.graphics();
    const title = this.add.text(0, -80, label, { fontFamily: FONT_FAMILY, fontSize: '32px', fontStyle: 'bold', color: CSS.ink, align: 'center' }).setOrigin(0.5);
    // One line, shrunk to fit the narrowest tile.
    for (let size = 32; title.width > 300 && size > 20; size -= 2) title.setFontSize(size);
    const have = this.add.text(0, -42, '', { fontFamily: FONT_FAMILY, fontSize: '28px', color: '#6b5d52' }).setOrigin(0.5).setName(`${name}-have`);
    const btn = new Button(
      this,
      0,
      42,
      buyLabel,
      () => {
        // A finger that was scrolling the list isn't buying.
        if (this.dragged) return;
        buy();
        audio().play('cash');
        this.refresh();
      },
      { width: 290, height: 120, fontSize: 34, name },
    );
    const box = this.add.container(0, 0, [bg, title, have, btn]);
    this.list.add(box);
    const tile: Tile = {
      box,
      bg,
      have,
      buy: btn,
      refresh: () => {
        const s = state();
        have.setText(s.low ? `${s.label} · low!` : s.label).setColor(s.low ? '#b0406a' : '#6b5d52');
        btn.setEnabled(s.can);
        if (s.owned) btn.setAlpha(0.3);
      },
    };
    this.tiles.push(tile);
    return tile;
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
      onMenu.add(glazeStockId(f.glaze));
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
