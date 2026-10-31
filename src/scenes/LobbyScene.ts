import Phaser from 'phaser';
import { TextureKeys } from '../assets/keys';
import type { Customer } from '../systems/GameSession';
import { session } from '../systems/services';
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

  constructor() {
    super(SceneKeys.Lobby);
  }

  create(): void {
    this.views = new Map();
    this.bubble = null;
    this.cameras.main.setBackgroundColor(COLORS.sky);
    const ground = this.add.graphics();
    const truck = new Truck(this, 0, 0);
    const sign = this.add.image(0, 0, TextureKeys.SignAFrame).setOrigin(0.5, 1);
    const waiting = this.add.rectangle(0, 0, 1, 1, 0xffffff, 0.25).setStrokeStyle(6, COLORS.ink, 0.35);
    const waitingLabel = this.add
      .text(0, 0, 'Waiting', { fontFamily: FONT_FAMILY, fontSize: '40px', color: CSS.ink })
      .setOrigin(0.5);

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

    listen(this, session().events, 'changed', () => this.sync(false));

    onLayout(this, (v: Viewport) => {
      const L = LAYOUT[v.orientation];
      const c = v.content;
      const groundY = c.y + L.groundY;

      // The ground fills the whole screen width and runs under the tab bar.
      ground.clear();
      ground.fillStyle(COLORS.concrete);
      ground.fillRect(0, groundY, v.width, v.height - groundY);
      ground.fillStyle(0xf4f2ee);
      for (let x = 60; x < v.width; x += 240) ground.fillRect(x, groundY + 53, 120, 14);

      truck.setPosition(c.x + L.truck.x, c.y + L.truck.y).setScale(L.truck.scale);
      sign.setPosition(c.x + L.sign.x, c.y + L.sign.feetY).setScale(L.sign.scale);
      waiting.setPosition(c.x + L.waiting.x, c.y + L.waiting.y).setSize(L.waiting.w, L.waiting.h);
      waitingLabel.setPosition(c.x + L.waiting.x, c.y + L.waiting.labelY);
      this.doneText.setPosition(c.x + c.width / 2, c.y + (v.orientation === 'landscape' ? 160 : 230));
      this.sync(true);
    });
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

    this.doneText.setVisible(s.isDayComplete);
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
