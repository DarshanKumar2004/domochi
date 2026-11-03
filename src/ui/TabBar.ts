import Phaser from 'phaser';
import type { Viewport } from './layout';
import type { StationKey, StationTab } from './tabs';
import { COLORS, CSS, FONT_FAMILY } from './theme';

/** Tabs never get wider than this, so on wide screens they sit together in the middle. */
const MAX_TAB_WIDTH = 300;

interface TabView {
  key: StationKey;
  icon: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  hit: Phaser.GameObjects.Zone;
}

/** Papa's-style station tabs along the bottom of the screen. */
export class TabBar extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly highlight: Phaser.GameObjects.Graphics;
  private readonly views: TabView[] = [];
  private activeTab: StationKey | null = null;
  private tabWidth = 0;
  private barHeight = 0;
  private firstTabX = 0;

  constructor(scene: Phaser.Scene, tabs: readonly StationTab[], onSelect: (key: StationKey) => void) {
    super(scene, 0, 0);
    this.bg = scene.make.graphics({}, false);
    this.highlight = scene.make.graphics({}, false);
    this.add([this.bg, this.highlight]);

    for (const tab of tabs) {
      const icon = new Phaser.GameObjects.Image(scene, 0, 0, tab.icon);
      const label = scene.make
        .text(
          {
            text: tab.label,
            style: { fontFamily: FONT_FAMILY, fontSize: '38px', fontStyle: 'bold', color: CSS.muted },
          },
          false,
        )
        .setOrigin(0.5);
      const hit = new Phaser.GameObjects.Zone(scene, 0, 0, 1, 1)
        .setOrigin(0)
        .setName(`tab-${tab.label}`)
        .setInteractive({ useHandCursor: true });
      hit.on(Phaser.Input.Events.POINTER_DOWN, () => onSelect(tab.scene));
      this.add([icon, label, hit]);
      this.views.push({ key: tab.scene, icon, label, hit });
    }
    scene.add.existing(this);
  }

  layout(v: Viewport): void {
    const h = v.tabBarHeight;
    this.barHeight = h;
    this.tabWidth = Math.min(v.width / this.views.length, MAX_TAB_WIDTH);
    this.firstTabX = (v.width - this.tabWidth * this.views.length) / 2;
    this.setPosition(0, v.height - h);

    this.bg.clear();
    this.bg.fillStyle(COLORS.tabBar);
    this.bg.fillRect(0, 0, v.width, h);
    this.bg.fillStyle(COLORS.pink);
    this.bg.fillRect(0, 0, v.width, 6);

    // Eight tabs on a phone held upright: smaller labels so "Toppings" fits.
    const font = this.tabWidth < 150 ? 28 : this.tabWidth < 175 ? 32 : 38;
    this.views.forEach((view, i) => {
      const x = this.firstTabX + this.tabWidth * i;
      view.label.setFontSize(font);
      view.icon.setPosition(x + this.tabWidth / 2, h * 0.39);
      view.label.setPosition(x + this.tabWidth / 2, h * 0.78);
      view.hit.setPosition(x, 0).setSize(this.tabWidth, h);
    });
    this.drawHighlight();
  }

  selectTab(key: StationKey): void {
    this.activeTab = key;
    for (const v of this.views) {
      const isActive = v.key === key;
      v.icon.setAlpha(isActive ? 1 : 0.5);
      v.label.setColor(isActive ? CSS.pink : CSS.muted);
    }
    this.drawHighlight();
  }

  private drawHighlight(): void {
    const index = this.views.findIndex((v) => v.key === this.activeTab);
    this.highlight.clear();
    if (index < 0 || this.tabWidth === 0) return;
    this.highlight.fillStyle(0xffffff, 0.08);
    this.highlight.fillRoundedRect(
      this.firstTabX + this.tabWidth * index + 10,
      14,
      this.tabWidth - 20,
      this.barHeight - 24,
      28,
    );
  }
}
