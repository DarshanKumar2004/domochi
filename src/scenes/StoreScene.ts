import Phaser from 'phaser';
import { audio, balance, menu, save } from '../systems/services';
import { fillStock, priceOn } from '../systems/supplies';
import { Button } from '../ui/Button';
import { beginOverlay } from '../ui/overlay';
import { COLORS, CSS, FONT_FAMILY } from '../ui/theme';
import type { Viewport } from '../ui/layout';
import { onLayout } from '../ui/viewport';
import { startMainGame, stopMainGame } from './flow';
import { SceneKeys } from './sceneKeys';

const TILE_H = 220;
const GAP = 18;

interface Tile {
  box: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Graphics;
  have: Phaser.GameObjects.Text;
  buy: Button;
  refresh: () => void;
}

const money = (n: number) => `$${n.toFixed(2)}`;

/**
 * The supply store, between days: buy packs of dough ingredients, boxes and
 * fryer oil (prices change from day to day), and glaze guides (bought once).
 * Spending comes straight out of the cash you've banked.
 */
export class StoreScene extends Phaser.Scene {
  private tiles: Tile[] = [];
  private cash!: Phaser.GameObjects.Text;

  constructor() {
    super(SceneKeys.Store);
  }

  create(): void {
    beginOverlay(this, 0.75);
    this.tiles = [];
    const day = save().data.day;
    const card = this.add.graphics();
    const text = (size: number, color: string = CSS.ink, bold = false) =>
      this.add.text(0, 0, '', { fontFamily: FONT_FAMILY, fontSize: `${size}px`, fontStyle: bold ? 'bold' : 'normal', color, align: 'center' }).setOrigin(0.5);
    const title = text(64, CSS.ink, true).setText('supply store');
    const sub = text(32, '#6b5d52').setText(`day ${day} prices · stock up before you open`);
    this.cash = text(44, CSS.ink, true).setName('store-cash');
    const suppliesLabel = text(34, '#6b5d52', true).setText('supplies');
    const guidesLabel = text(34, '#6b5d52', true).setText('glaze guides: dashed lines that show you where to pour');

    for (const it of balance.supplies.items) {
      const price = priceOn(it, day, balance.supplies.priceSwing);
      const swing = price / it.price - 1;
      const trend = swing > 0.08 ? '  ▲' : swing < -0.08 ? '  ▼' : '';
      this.tiles.push(
        this.makeTile(`store-${it.id}`, it.name, `+${it.pack} · ${money(price)}${trend}`, () => {
          const have = this.stock()[it.id] ?? 0;
          return { label: `have ${have}`, low: have < it.pack, can: save().data.money >= price, owned: false };
        }, () => {
          void save().update((d) => {
            const stock = fillStock(d.stock, balance.supplies);
            stock[it.id] = (stock[it.id] ?? 0) + it.pack;
            d.stock = stock;
            d.money = Math.round((d.money - price) * 100) / 100;
          });
        }),
      );
    }
    const supplyCount = this.tiles.length;
    for (const g of balance.guides.items) {
      const flavor = menu.flavors.find((f) => f.id === g.id);
      const name = g.id === 'base' ? 'base coat' : (flavor?.name ?? g.id);
      this.tiles.push(
        this.makeTile(`store-guide-${g.id}`, name, money(g.price), () => {
          const owned = save().data.guides.includes(g.id);
          return { label: owned ? 'yours ✓' : g.id === 'base' ? 'loops for every glaze' : 'drizzle stripes', low: false, can: !owned && save().data.money >= g.price, owned };
        }, () => {
          void save().update((d) => {
            if (d.guides.includes(g.id)) return;
            d.guides.push(g.id);
            d.money = Math.round((d.money - g.price) * 100) / 100;
          });
        }),
      );
    }

    const start = new Button(this, 0, 0, `Open day ${day}`, () => this.openDay(), { width: 560, name: 'btn-store-done' });
    this.refresh();

    onLayout(this, (v: Viewport) => {
      const L = v.orientation === 'landscape';
      const cols = L ? 5 : 2;
      const tileW = L ? 330 : 470;
      const w = cols * tileW + (cols - 1) * GAP + 80;
      const supplyRows = Math.ceil(supplyCount / cols);
      const guideRows = Math.ceil((this.tiles.length - supplyCount) / cols);
      const head = 230;
      const h = head + 60 + supplyRows * (TILE_H + GAP) + 60 + guideRows * (TILE_H + GAP) + 190;
      const scale = Math.min(1, (v.height - 30) / h, (v.width - 30) / w);
      const cx = v.width / 2;
      const top = v.height / 2 - (h * scale) / 2;
      const at = (y: number) => top + y * scale;

      card.clear();
      card.fillStyle(0x000000, 0.25);
      card.fillRoundedRect(cx - (w * scale) / 2, top + 12, w * scale, h * scale, 48 * scale);
      card.fillStyle(COLORS.card);
      card.fillRoundedRect(cx - (w * scale) / 2, top, w * scale, h * scale, 48 * scale);
      title.setPosition(cx, at(70)).setScale(scale);
      sub.setPosition(cx, at(130)).setScale(scale);
      this.cash.setPosition(cx, at(190)).setScale(scale);

      const place = (from: number, count: number, y0: number) => {
        for (let i = 0; i < count; i++) {
          const col = i % cols;
          const row = Math.floor(i / cols);
          const x = cx + (col - (cols - 1) / 2) * (tileW + GAP) * scale;
          const y = at(y0 + row * (TILE_H + GAP) + TILE_H / 2);
          const t = this.tiles[from + i]!;
          t.box.setPosition(x, y).setScale(scale);
          t.bg.clear();
          t.bg.fillStyle(0xffffff, 0.7);
          t.bg.fillRoundedRect(-tileW / 2, -TILE_H / 2, tileW, TILE_H, 24);
          t.bg.lineStyle(3, COLORS.ink, 0.15);
          t.bg.strokeRoundedRect(-tileW / 2, -TILE_H / 2, tileW, TILE_H, 24);
        }
      };
      suppliesLabel.setPosition(cx, at(head + 25)).setScale(scale);
      const suppliesY = head + 60;
      place(0, supplyCount, suppliesY);
      const guidesTop = suppliesY + supplyRows * (TILE_H + GAP);
      guidesLabel.setPosition(cx, at(guidesTop + 25)).setScale(scale).setWordWrapWidth(w - 80);
      place(supplyCount, this.tiles.length - supplyCount, guidesTop + 60);
      start.setPosition(cx, at(h - 100)).setScale(scale);
    });
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
        buy();
        audio().play('cash');
        this.refresh();
      },
      { width: 290, height: 120, fontSize: 34, name },
    );
    const box = this.add.container(0, 0, [bg, title, have, btn]);
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
    return tile;
  }

  private refresh(): void {
    this.cash.setText(`cash ${money(save().data.money)}`);
    for (const t of this.tiles) t.refresh();
  }

  private openDay(): void {
    stopMainGame(this);
    startMainGame(this);
  }
}
