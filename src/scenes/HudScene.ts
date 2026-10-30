import Phaser from 'phaser';
import { menu, session } from '../systems/services';
import { Button } from '../ui/Button';
import { TabBar } from '../ui/TabBar';
import { STATION_TABS, type StationKey } from '../ui/tabs';
import { TicketRail } from '../ui/TicketRail';
import { onLayout } from '../ui/viewport';
import { listen } from './listen';
import { SceneKeys } from './sceneKeys';

/** Longest step the game clock takes per frame, so a hitch doesn't skip time. */
const MAX_TICK_MS = 250;

/**
 * Always-on-top layer: ticket rail along the top, tab bar along the bottom.
 * It also runs the game clock, so customers keep arriving while you're at a
 * station. Switching stations puts the old one to sleep (keeping its state)
 * and wakes or starts the new one.
 */
export class HudScene extends Phaser.Scene {
  private current: StationKey = SceneKeys.Lobby;
  private tabBar!: TabBar;
  private rail!: TicketRail;

  constructor() {
    super(SceneKeys.Hud);
  }

  create(): void {
    this.current = SceneKeys.Lobby;
    this.tabBar = new TabBar(this, STATION_TABS, (key) => this.goTo(key));
    this.tabBar.selectTab(this.current);
    this.rail = new TicketRail(this, menu, (no) => session().selectTicket(no));
    const settings = new Button(this, 0, 0, 'Settings', () => this.openSettings(), {
      width: 240,
      height: 120,
      fontSize: 42,
      name: 'btn-settings',
    });

    listen(this, session().events, 'changed', () => this.rail.refresh(session()));
    onLayout(this, (v) => {
      this.tabBar.layout(v);
      this.rail.layout(v, session());
      settings.setPosition(v.width - 150, v.railHeight / 2 - 2).setScale(v.orientation === 'landscape' ? 0.9 : 1);
    });
  }

  override update(_time: number, delta: number): void {
    session().tick(Math.min(delta, MAX_TICK_MS));
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

  private openSettings(): void {
    if (!this.scene.isActive(SceneKeys.Settings)) this.scene.launch(SceneKeys.Settings);
  }
}
