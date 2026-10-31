import Phaser from 'phaser';
import { TextureKeys } from '../assets/keys';
import type { Customer } from '../systems/GameSession';
import { audio, session } from '../systems/services';
import { Booth } from '../ui/Booth';
import { LobbyScenery } from '../ui/LobbyScenery';
import { Button } from '../ui/Button';
import type { Viewport } from '../ui/layout';
import { SpeechBubble } from '../ui/SpeechBubble';
import { COLORS, CSS, FONT_FAMILY } from '../ui/theme';
import { Truck } from '../ui/Truck';
import { getViewport, onLayout } from '../ui/viewport';
import { listen } from './listen';
import { SceneKeys } from './sceneKeys';

/** Customer sprite height in texture pixels (see MANIFEST). */
const CUSTOMER_H = 340;
/** How fast customers walk, in logical px per second (visual only). */
const WALK_SPEED = 700;

/** Positions inside the content area, per orientation. */
const LAYOUT = {
  portrait: {
    groundY: 700,
    // Truck y puts the wheels on the ground line.
    truck: { x: 540, y: 470, scale: 0.9 },
    sign: { x: 120, feetY: 850, scale: 0.7 },
    line: { x: [600, 760, 920, 1080], feetY: 1300, scale: 0.85 },
    panel: { x: 780, y: 1060, buttonY: 1330, width: 540 },
    pickups: { x: 780, y: 1500 },
    waiting: {
      x: 250,
      y: 1185,
      w: 440,
      h: 560,
      labelY: 1500,
      scale: 0.7,
      slots: [
        [150, 1170],
        [350, 1170],
        [150, 1440],
        [350, 1440],
      ],
    },
  },
  landscape: {
    groundY: 380,
    truck: { x: 420, y: 205, scale: 0.65 },
    sign: { x: 820, feetY: 470, scale: 0.6 },
    line: { x: [980, 1130, 1280, 1430], feetY: 700, scale: 0.8 },
    panel: { x: 1205, y: 420, buttonY: 680, width: 600 },
    pickups: { x: 1730, y: 215 },
    waiting: {
      x: 1730,
      y: 500,
      w: 360,
      h: 470,
      labelY: 755,
      scale: 0.6,
      slots: [
        [1630, 480],
        [1810, 480],
        [1630, 715],
        [1810, 715],
      ],
    },
  },
} as const;

interface CustomerView {
  id: number;
  image: Phaser.GameObjects.Image;
  tag: Phaser.GameObjects.Text;
  target: { x: number; y: number; scale: number } | null;
  moving: boolean;
  leaving: boolean;
}

/** The lot by domochi's trailer: the line, the waiting area, and handing over orders. */
export class LobbyScene extends Phaser.Scene {
  private views = new Map<number, CustomerView>();
  private frontTag!: Phaser.GameObjects.Text;
  private doneText!: Phaser.GameObjects.Text;
  private bubble: SpeechBubble | null = null;
  private truck: Truck | null = null;
  private scenery!: LobbyScenery;
  /** Morning prep / closing time: a checklist and a button (open the window, close up). */
  private panelText!: Phaser.GameObjects.Text;
  private openButton!: Button;
  private closeButton!: Button;
  private pickupsText!: Phaser.GameObjects.Text;

  constructor() {
    super(SceneKeys.Lobby);
  }

  create(): void {
    this.views = new Map();
    this.bubble = null;
    this.confirmOpen = false;
    this.cameras.main.setBackgroundColor(COLORS.sky);
    this.scenery = new LobbyScenery(this);
    // A pop-up booth on event days, the trailer otherwise.
    const ev = session().event;
    this.truck = ev ? null : new Truck(this, 0, 0);
    const truck: Phaser.GameObjects.Container = this.truck ?? new Booth(this, 0, 0, ev!.name);
    const sign = this.add.image(0, 0, TextureKeys.SignAFrame).setOrigin(0.5, 1);
    // A little chalkboard naming the patio where customers wait.
    const waitingLabel = this.add
      .text(0, 0, 'waiting patio', { fontFamily: FONT_FAMILY, fontSize: '34px', color: CSS.cream, backgroundColor: '#2b2522', padding: { x: 16, y: 6 } })
      .setOrigin(0.5)
      .setDepth(4);

    this.frontTag = this.add
      .text(0, 0, 'Tap me!', {
        fontFamily: FONT_FAMILY,
        fontSize: '42px',
        fontStyle: 'bold',
        color: CSS.ink,
        backgroundColor: CSS.cream,
        padding: { x: 18, y: 10 },
      })
      .setOrigin(0.5)
      .setDepth(10);
    this.tweens.add({ targets: this.frontTag, scale: 1.1, duration: 500, yoyo: true, repeat: -1 });

    this.doneText = this.add
      .text(0, 0, "that's everyone for today!\nthanks for a sweet day", {
        fontFamily: FONT_FAMILY,
        fontSize: '44px',
        color: CSS.ink,
        align: 'center',
        backgroundColor: CSS.cream,
        padding: { x: 24, y: 16 },
      })
      .setOrigin(0.5)
      .setDepth(20);

    this.panelText = this.add
      .text(0, 0, '', { fontFamily: FONT_FAMILY, fontSize: '38px', color: CSS.ink, backgroundColor: CSS.cream, padding: { x: 24, y: 16 }, align: 'left', lineSpacing: 6 })
      .setOrigin(0.5)
      .setDepth(20)
      .setName('lobby-checklist');
    this.openButton = new Button(this, 0, 0, 'Open the window', () => this.openShop(), { width: 520, name: 'btn-open' }).setDepth(21);
    this.closeButton = new Button(this, 0, 0, 'Close up', () => this.closeUp(), { width: 520, name: 'btn-close-up' }).setDepth(21);
    this.pickupsText = this.add
      .text(0, 0, '', { fontFamily: FONT_FAMILY, fontSize: '32px', color: CSS.ink, backgroundColor: '#fffaf0cc', padding: { x: 18, y: 12 }, align: 'left' })
      .setOrigin(0.5)
      .setDepth(8)
      .setName('lobby-pickups');
    // Pickup countdowns tick every second.
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.syncPanels() });

    listen(this, session().events, 'changed', () => this.sync(false));

    onLayout(this, (v: Viewport) => {
      const L = LAYOUT[v.orientation];
      const c = v.content;
      const groundY = c.y + L.groundY;

      // The lot, sky and patio fill the whole screen width and run under the tab bar.
      this.scenery.layout(v, {
        groundY,
        truck: { x: c.x + L.truck.x, y: c.y + L.truck.y, scale: L.truck.scale },
        sign: { x: c.x + L.sign.x, feetY: c.y + L.sign.feetY },
        patio: { x: c.x + L.waiting.x, y: c.y + L.waiting.y, w: L.waiting.w, h: L.waiting.h },
      });

      truck.setPosition(c.x + L.truck.x, c.y + L.truck.y).setScale(L.truck.scale);
      sign.setPosition(c.x + L.sign.x, c.y + L.sign.feetY).setScale(L.sign.scale);
      waitingLabel.setPosition(c.x + L.waiting.x, c.y + L.waiting.labelY);
      this.doneText.setPosition(c.x + c.width / 2, c.y + (v.orientation === 'landscape' ? 160 : 230));
      this.panelText.setPosition(c.x + L.panel.x, c.y + L.panel.y).setWordWrapWidth(L.panel.width);
      this.openButton.setPosition(c.x + L.panel.x, c.y + L.panel.buttonY);
      this.closeButton.setPosition(c.x + L.panel.x, c.y + L.panel.buttonY);
      this.pickupsText.setPosition(c.x + L.pickups.x, c.y + L.pickups.y);
      this.sync(true);
    });
  }

  override update(_time: number, delta: number): void {
    this.scenery.update(delta);
  }

  // ---- Rendering from session state --------------------------------------

  /** Bring sprites in line with the session. `snap` skips walking (used on relayout). */
  private sync(snap: boolean): void {
    const s = session();
    const v = getViewport(this);
    const L = LAYOUT[v.orientation];
    const c = v.content;
    const present = new Set<number>();

    s.line.forEach((cust, i) => {
      present.add(cust.id);
      const x = c.x + (L.line.x[Math.min(i, L.line.x.length - 1)] ?? 0) + Math.max(0, i - 3) * 40;
      const name = i === 0 && cust.state === 'inLine' ? 'customer-front' : '';
      this.place(cust, { x, y: c.y + L.line.feetY, scale: L.line.scale }, name, snap, v);
    });

    s.waiting.forEach((cust, i) => {
      present.add(cust.id);
      const slot = L.waiting.slots[i % L.waiting.slots.length]!;
      const wrap = Math.floor(i / L.waiting.slots.length) * 30;
      this.place(cust, { x: c.x + slot[0] + wrap, y: c.y + slot[1] - wrap, scale: L.waiting.scale }, `waiting-${cust.ticketNo}`, snap, v);
    });

    for (const view of this.views.values()) {
      if (!present.has(view.id) && !view.leaving) this.leave(view);
    }

    const front = s.line[0];
    const frontView = front ? this.views.get(front.id) : undefined;
    const showTag = !!frontView && front?.state === 'inLine' && !frontView.moving;
    this.frontTag.setVisible(showTag);
    if (showTag && frontView) {
      this.frontTag.setPosition(frontView.image.x, frontView.image.y - CUSTOMER_H * frontView.image.scale - 50);
    }

    this.doneText.setVisible(s.isDayComplete && s.phase === 'open');
    this.syncPanels();
  }

  /** The prep / closing checklist and button, the sign, and the pickups list. */
  private syncPanels(): void {
    const s = session();
    this.scenery.setPhase(s.phase);
    this.truck?.setOpen(s.phase === 'open');
    const prep = s.phase === 'prep';
    const closing = s.phase === 'closing';
    this.openButton.setVisible(prep);
    this.closeButton.setVisible(closing);
    if (prep) {
      const dough = Number.isFinite(s.dough) ? s.dough : 0;
      const lines = [
        s.event ? `pop-up day: ${s.event.name}!` : 'good morning! before opening:',
        `• ${dough ? `dough: ${dough} donuts ready` : 'make dough (Dough station)'}`,
      ];
      if (s.pickups.length) lines.push(`• ${s.pickups.length} pickup${s.pickups.length === 1 ? '' : 's'} on the rail`);
      lines.push('then open the window!');
      this.panelText.setText(lines.join('\n')).setVisible(true);
    } else if (closing) {
      const c = s.cleanup;
      const tick = (done: boolean) => (done ? '(done)' : '');
      this.panelText
        .setText(
          [
            'closing time! clean up:',
            `• wipe the glaze tray ${tick(c.glazeTray)}`,
            `• wipe the toppings tray ${tick(c.toppingsTray)}`,
            `• filter the fryer oil ${tick(c.oil)}`,
          ].join('\n'),
        )
        .setVisible(true);
      this.closeButton.setLabel(c.glazeTray && c.toppingsTray && c.oil ? 'Close up' : 'Close anyway');
    } else {
      this.panelText.setVisible(false);
    }

    // Pickups waiting for a courier, with how long until they're late.
    const pickups = s.pickups;
    if (pickups.length) {
      const rows = pickups.map((cust) => {
        const t = s.ticket(cust.ticketNo!)!;
        const left = Math.max(0, Math.round(s.typeOf(cust).patienceSec - (s.timeMs - t.takenAtMs) / 1000));
        return `#${t.no} ${s.typeOf(cust).name} · ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
      });
      this.pickupsText.setText(['pickups (courier):', ...rows].join('\n')).setVisible(true);
    } else {
      this.pickupsText.setVisible(false);
    }
  }

  private openShop(): void {
    const s = session();
    if (Number.isFinite(s.dough) && s.dough === 0) {
      // Allowed, but worth a nudge.
      this.panelText.setText('no dough yet! make a batch at the Dough station first\n(or open anyway: tap again)');
      if (!this.confirmOpen) {
        this.confirmOpen = true;
        return;
      }
    }
    if (s.openShop()) audio().play('chime');
  }

  private confirmOpen = false;

  private closeUp(): void {
    if (session().closeUp()) this.scene.launch(SceneKeys.DaySummary);
  }

  private place(cust: Customer, target: { x: number; y: number; scale: number }, name: string, snap: boolean, v: Viewport): void {
    let view = this.views.get(cust.id);
    if (!view) {
      view = this.createView(cust, target, v);
      this.views.set(cust.id, view);
    }
    // Hidden when empty: an empty Text still draws its background padding.
    const label = cust.ticketNo !== undefined && cust.state === 'waiting' ? `#${cust.ticketNo}` : '';
    view.tag.setText(label).setVisible(label !== '');

    const t = view.target;
    const same = !!t && t.x === target.x && t.y === target.y && t.scale === target.scale;
    if (same && !snap) {
      if (!view.moving) view.image.setName(name);
      return;
    }
    view.target = target;
    this.tweens.killTweensOf(view.image);

    if (snap) {
      view.image.setPosition(target.x, target.y).setScale(target.scale).setName(name);
      view.moving = false;
      this.positionTag(view);
      return;
    }

    view.image.setName('');
    view.moving = true;
    const dist = Phaser.Math.Distance.Between(view.image.x, view.image.y, target.x, target.y);
    const moving = view;
    this.tweens.add({
      targets: view.image,
      x: target.x,
      y: target.y,
      scale: target.scale,
      duration: Math.max(150, (dist / WALK_SPEED) * 1000),
      onUpdate: () => this.positionTag(moving),
      onComplete: () => {
        moving.moving = false;
        moving.image.setName(name);
        this.positionTag(moving);
        this.sync(false); // refresh the front tag now they've arrived
      },
    });
  }

  private createView(cust: Customer, target: { x: number; y: number; scale: number }, v: Viewport): CustomerView {
    const key = session().typeOf(cust).sprite;
    // New arrivals walk in from off the right edge.
    const image = this.add.image(v.width + 120, target.y, key).setOrigin(0.5, 1).setScale(target.scale).setDepth(5);
    image.setInteractive({ useHandCursor: true });
    image.on(Phaser.Input.Events.POINTER_UP, () => this.onCustomerTap(cust.id));
    const tag = this.add
      .text(0, 0, '', {
        fontFamily: FONT_FAMILY,
        fontSize: '40px',
        fontStyle: 'bold',
        color: CSS.cream,
        backgroundColor: CSS.ink,
        padding: { x: 12, y: 4 },
      })
      .setOrigin(0.5)
      .setDepth(6);
    return { id: cust.id, image, tag, target: null, moving: false, leaving: false };
  }

  private positionTag(view: CustomerView): void {
    view.tag.setPosition(view.image.x, view.image.y - CUSTOMER_H * view.image.scale - 24);
  }

  /** Served customers walk off the left edge. */
  private leave(view: CustomerView): void {
    view.leaving = true;
    view.image.disableInteractive().setName('');
    view.tag.setVisible(false);
    this.tweens.killTweensOf(view.image);
    this.tweens.add({
      targets: view.image,
      x: -200,
      duration: Math.max(300, ((view.image.x + 200) / WALK_SPEED) * 1000),
      onComplete: () => {
        view.image.destroy();
        view.tag.destroy();
        this.views.delete(view.id);
      },
    });
  }

  // ---- Input ----------------------------------------------------------------

  private onCustomerTap(id: number): void {
    const s = session();
    const cust = s.customer(id);
    const view = this.views.get(id);
    if (!cust || !view || view.moving || view.leaving) return;

    if (cust.state === 'inLine' && s.line[0]?.id === id) {
      if (this.scene.isActive(SceneKeys.Order)) return;
      const ticket = s.takeOrder(id);
      this.scene.launch(SceneKeys.Order, { ticketNo: ticket.no });
      return;
    }

    if (cust.state === 'waiting') {
      // Orders are handed over automatically when their box is closed.
      this.say(view, `#${cust.ticketNo}: can't wait! (close my box at the Box station)`);
    }
  }

  /** Short-lived speech bubble above a customer. */
  private say(view: CustomerView, text: string): void {
    this.bubble?.destroy();
    const v = getViewport(this);
    const w = 560;
    const x = Phaser.Math.Clamp(view.image.x, w / 2 + 20, v.width - w / 2 - 20);
    const bubble = new SpeechBubble(this, x, 0, w, text, Phaser.Math.Clamp(view.image.x - x, -200, 200), 38);
    bubble.setPosition(x, view.image.y - CUSTOMER_H * view.image.scale - 130).setDepth(30).setName('bubble-customer');
    this.bubble = bubble;
    this.time.delayedCall(2200, () => {
      if (this.bubble === bubble) this.bubble = null;
      bubble.destroy();
    });
  }
}
