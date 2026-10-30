import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, TAB_BAR_HEIGHT } from './layout';
import type { StationKey, StationTab } from './tabs';
import { COLORS, CSS, FONT_FAMILY } from './theme';

interface TabView {
  key: StationKey;
  icon: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
}

/** Papa's-style station tabs along the bottom of the screen. */
export class TabBar extends Phaser.GameObjects.Container {
  private readonly highlight: Phaser.GameObjects.Graphics;
  private readonly views: TabView[] = [];
  private readonly tabWidth: number;

  constructor(scene: Phaser.Scene, tabs: readonly StationTab[], onSelect: (key: StationKey) => void) {
    super(scene, 0, GAME_HEIGHT - TAB_BAR_HEIGHT);
    this.tabWidth = GAME_WIDTH / tabs.length;

    const bg = scene.make.graphics({}, false);
    bg.fillStyle(COLORS.tabBar);
    bg.fillRect(0, 0, GAME_WIDTH, TAB_BAR_HEIGHT);
    bg.fillStyle(COLORS.pink);
    bg.fillRect(0, 0, GAME_WIDTH, 6);
    this.highlight = scene.make.graphics({}, false);
    this.add([bg, this.highlight]);

    tabs.forEach((tab, i) => {
      const cx = this.tabWidth * (i + 0.5);
      const icon = new Phaser.GameObjects.Image(scene, cx, 78, tab.icon);
      const label = scene.make
        .text(
          {
            x: cx,
            y: 156,
            text: tab.label,
            style: { fontFamily: FONT_FAMILY, fontSize: '38px', fontStyle: 'bold', color: CSS.muted },
          },
          false,
        )
        .setOrigin(0.5);
      const hit = new Phaser.GameObjects.Zone(scene, this.tabWidth * i, 0, this.tabWidth, TAB_BAR_HEIGHT)
        .setOrigin(0)
        .setName(`tab-${tab.label}`)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => onSelect(tab.scene));
      this.add([icon, label, hit]);
      this.views.push({ key: tab.scene, icon, label });
    });

    scene.add.existing(this);
  }

  selectTab(key: StationKey): void {
    const index = this.views.findIndex((v) => v.key === key);
    this.highlight.clear();
    if (index >= 0) {
      this.highlight.fillStyle(0xffffff, 0.08);
      this.highlight.fillRoundedRect(this.tabWidth * index + 10, 16, this.tabWidth - 20, TAB_BAR_HEIGHT - 28, 28);
    }
    for (const v of this.views) {
      const active = v.key === key;
      v.icon.setAlpha(active ? 1 : 0.5);
      v.label.setColor(active ? CSS.pink : CSS.muted);
    }
  }
}
