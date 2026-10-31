import Phaser from 'phaser';
import { audio, isClockPaused, menu, save, session } from '../systems/services';
import { Button } from '../ui/Button';
import { TabBar } from '../ui/TabBar';
import { STATION_TABS, type StationKey } from '../ui/tabs';
import { TicketRail } from '../ui/TicketRail';
import { CSS, FONT_FAMILY } from '../ui/theme';
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
    this.rail = new TicketRail(
      this,
      menu,
      (no) => session().selectTicket(no),
      (no) => {
        if (!this.scene.isActive(SceneKeys.TicketView)) this.scene.launch(SceneKeys.TicketView, { ticketNo: no });
      },
      () => {
        const today = session().summary();
        return save().data.money + today.sales + today.tips + today.tidyBonus;
      },
    );
    const settings = new Button(this, 0, 0, 'Settings', () => this.openSettings(), {
      width: 240,
      height: 120,
      fontSize: 42,
      name: 'btn-settings',
    });

    let arrived = session().arrivals;
    listen(this, session().events, 'changed', () => {
      this.rail.refresh(session());
      if (session().arrivals > arrived) audio().play('chime');
      arrived = session().arrivals;
    });
    // The day's clock on the rail ticks every second.
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.rail.refreshDay(session()) });
    // Ethan's friends dropping by, and the window closing, get a note at the top.
    this.toast = this.add
      .text(0, 0, '', { fontFamily: FONT_FAMILY, fontSize: '38px', fontStyle: 'bold', color: CSS.ink, align: 'center', backgroundColor: CSS.cream, padding: { x: 28, y: 16 } })
      .setOrigin(0.5, 0)
      .setDepth(50)
      .setVisible(false)
      .setName('hud-toast');
    listen(this, session().events, 'friend', (e) => {
      audio().play('chime');
      this.showToast(`${e.name} (Ethan's friend) dropped by:\n"${e.line}"`);
    });
    listen(this, session().events, 'timeUp', () => {
      audio().play('ding');
      this.showToast(session().unserved ? "time's up! the window's closed.\nfinish the last orders" : "time's up! the window's closed");
    });
    onLayout(this, (v) => {
      this.toast.setPosition(v.width / 2, v.railHeight + 20).setWordWrapWidth(Math.min(1000, v.width - 60));
      this.tabBar.layout(v);
      this.rail.layout(v, session());
      settings.setPosition(v.width - 150, v.railHeight / 2 - 2).setScale(v.orientation === 'landscape' ? 0.9 : 1);
    });
  }

  override update(_time: number, delta: number): void {
    if (!isClockPaused()) session().tick(Math.min(delta, MAX_TICK_MS));
  }

  private toast!: Phaser.GameObjects.Text;

  /** A note under the rail for a few seconds. */
  showToast(text: string): void {
    this.tweens.killTweensOf(this.toast);
    this.toast.setText(text).setVisible(true).setAlpha(1);
    this.tweens.add({ targets: this.toast, alpha: 0, delay: 4200, duration: 500, onComplete: () => this.toast.setVisible(false) });
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
