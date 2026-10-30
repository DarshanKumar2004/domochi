import Phaser from 'phaser';
import { TabBar } from '../ui/TabBar';
import { STATION_TABS, type StationKey } from '../ui/tabs';
import { onLayout } from '../ui/viewport';
import { SceneKeys } from './sceneKeys';

/**
 * Always-on-top layer with the tab bar. Switching stations puts the old one
 * to sleep (keeping its state) and wakes or starts the new one.
 */
export class HudScene extends Phaser.Scene {
  private current: StationKey = SceneKeys.Lobby;
  private tabBar!: TabBar;

  constructor() {
    super(SceneKeys.Hud);
  }

  create(): void {
    this.current = SceneKeys.Lobby;
    this.tabBar = new TabBar(this, STATION_TABS, (key) => this.goTo(key));
    this.tabBar.selectTab(this.current);
    onLayout(this, (v) => this.tabBar.layout(v));
  }

  get currentStation(): StationKey {
    return this.current;
  }

  goTo(key: StationKey): void {
    if (key === this.current) return;
    this.scene.sleep(this.current);
    this.scene.run(key);
    this.scene.bringToTop();
    this.current = key;
    this.tabBar.selectTab(key);
  }
}
