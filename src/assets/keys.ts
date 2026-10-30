// Every texture and animation is referenced by these keys only.
// Each key must also be documented in assets/MANIFEST.md (a unit test checks this).

export const TextureKeys = {
  Truck: 'truck',
  Ethan: 'ethan',
  Customer: 'customer',
  DonutPlain: 'donut-plain',
  Fryer: 'fryer',
  GlazeBowl: 'glaze-bowl',
  ToppingJar: 'topping-jar',
  DonutBox: 'donut-box',
  IconLobby: 'icon-lobby',
  IconFry: 'icon-fry',
  IconGlaze: 'icon-glaze',
  IconToppings: 'icon-toppings',
  IconBox: 'icon-box',
} as const;

export type TextureKey = (typeof TextureKeys)[keyof typeof TextureKeys];

export const AnimKeys = {
  EthanWave: 'ethan-wave',
} as const;

/** Ethan sprite sheet: frames laid out left to right. */
export const ETHAN_FRAME = { width: 220, height: 260, count: 4 } as const;

/**
 * Anchor points inside the truck image, in its own pixel coordinates.
 * Update these if the real truck art puts the window or sign elsewhere.
 */
export const TRUCK_SPEC = {
  width: 900,
  height: 620,
  /** Ethan's feet are placed here, so he appears to stand behind the counter. */
  windowBottomCenter: { x: 450, y: 440 },
  signCenter: { x: 450, y: 45 },
} as const;
