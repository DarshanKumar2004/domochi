// Responsive layout maths. No Phaser imports, so unit and Playwright tests can use it.
//
// The game has two orientations. Each has a "safe area" (the long side is 1920 and
// the short side 1080) where all important UI goes. The game canvas is grown
// to match the screen's shape, so backgrounds fill the whole screen with
// no black bars. The short side is always 1080 logical px, so touch targets
// stay the same physical size in both orientations.

export const SAFE_LONG = 1920;
export const SAFE_SHORT = 1080;

/** Beyond this long:short ratio we stop growing and letterbox (e.g. super-ultrawide monitors). */
export const MAX_ASPECT = 2.4;

/** Minimum touch target size in logical pixels (see CLAUDE.md, Display). */
export const MIN_HIT_SIZE = 120;

export const TAB_BAR_HEIGHT = { portrait: 200, landscape: 160 } as const;
/** Ticket rail across the top of the main game (day, tickets, settings). */
export const RAIL_HEIGHT = { portrait: 170, landscape: 140 } as const;

export type Orientation = 'portrait' | 'landscape';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Viewport {
  /** Full game size (what backgrounds must cover). */
  width: number;
  height: number;
  orientation: Orientation;
  /** Centred 1920×1080 or 1080×1920 area that is always on screen. */
  safe: Rect;
  tabBarHeight: number;
  railHeight: number;
  /** Safe area minus anything the ticket rail and tab bar cover: where station content goes. */
  content: Rect;
}

/** Game size for a screen (or browser window) of the given size, in any units. */
export function gameSizeFor(screenWidth: number, screenHeight: number): { width: number; height: number } {
  if (!(screenWidth > 0) || !(screenHeight > 0)) return { width: SAFE_SHORT, height: SAFE_LONG };

  const landscape = screenWidth > screenHeight;
  const long = Math.max(screenWidth, screenHeight);
  const short = Math.min(screenWidth, screenHeight);
  const aspect = Math.min(long / short, MAX_ASPECT);

  let gameLong: number;
  let gameShort: number;
  if (aspect >= SAFE_LONG / SAFE_SHORT) {
    // Longer than 16:9 (most phones): extend the long side.
    gameShort = SAFE_SHORT;
    gameLong = Math.round(SAFE_SHORT * aspect);
  } else {
    // Squarer than 16:9 (tablets, many laptop windows): extend the short side.
    gameLong = SAFE_LONG;
    gameShort = Math.round(SAFE_LONG / aspect);
  }
  return landscape ? { width: gameLong, height: gameShort } : { width: gameShort, height: gameLong };
}

/** Layout information for a game of the given size. */
export function viewportFor(width: number, height: number): Viewport {
  const orientation: Orientation = width > height ? 'landscape' : 'portrait';
  const safeW = orientation === 'landscape' ? SAFE_LONG : SAFE_SHORT;
  const safeH = orientation === 'landscape' ? SAFE_SHORT : SAFE_LONG;
  const safe: Rect = { x: (width - safeW) / 2, y: (height - safeH) / 2, width: safeW, height: safeH };

  const tabBarHeight = TAB_BAR_HEIGHT[orientation];
  const railHeight = RAIL_HEIGHT[orientation];
  const contentTop = Math.max(safe.y, railHeight);
  const contentBottom = Math.min(safe.y + safe.height, height - tabBarHeight);
  const content: Rect = { x: safe.x, y: contentTop, width: safe.width, height: contentBottom - contentTop };

  return { width, height, orientation, safe, tabBarHeight, railHeight, content };
}
