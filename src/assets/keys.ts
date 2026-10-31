// Every texture and animation is referenced by these keys only.
// Each key must also be documented in assets/MANIFEST.md (a unit test checks this).

export const TextureKeys = {
  Logo: 'logo',
  Truck: 'truck',
  SignAFrame: 'sign-aframe',
  Ethan: 'ethan',
  CustomerStudent: 'customer-student',
  CustomerOffice: 'customer-office',
  CustomerParent: 'customer-parent',
  CustomerRegular: 'customer-regular',
  DonutPlain: 'donut-plain',
  Fryer: 'fryer',
  FryGrate: 'fry-grate',
  FryDispenser: 'fry-dispenser',
  TrashBin: 'trash-bin',
  PointerHand: 'pointer-hand',
  Mascot: 'mascot',
  MixingBowl: 'mixing-bowl',
  IngredientBin: 'ingredient-bin',
  Sponge: 'sponge',
  PopupBooth: 'popup-booth',
  DonutFry: 'donut-fry',
  GlazeCup: 'glaze-cup',
  SugarSifter: 'sugar-sifter',
  ToppingJar: 'topping-jar',
  DonutBox: 'donut-box',
  IconLobby: 'icon-lobby',
  IconDough: 'icon-dough',
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

/** Anchor points inside the pop-up booth image (event days), in its own pixels. */
export const BOOTH_SPEC = {
  width: 900,
  height: 620,
  /** Centre of the blank banner on the canopy (the logo and event name go here). */
  bannerCenter: { x: 450, y: 150 },
  /** Ethan stands behind the table; his feet go here. */
  ethanFeet: { x: 300, y: 470 },
} as const;

/**
 * Anchor points inside the truck image, in its own pixel coordinates.
 * The truck is domochi's white trailer (see photos from Kumar, 2026-10-30):
 * serving window on the left, black OPEN sign, big logo on the right side.
 * Update these if the real truck art puts things elsewhere.
 */
export const TRUCK_SPEC = {
  width: 900,
  height: 620,
  /** Ethan's feet are placed here, so he appears to stand behind the counter. */
  windowBottomCenter: { x: 250, y: 390 },
  /** Ethan is drawn at this scale so he fits the window. */
  ethanScale: 0.85,
  openSignCenter: { x: 515, y: 200 },
  logoCenter: { x: 720, y: 250 },
  logoSize: 260,
  handleCenter: { x: 720, y: 430 },
} as const;
