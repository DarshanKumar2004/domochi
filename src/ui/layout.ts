// Layout constants. No Phaser imports, so Playwright tests can use them too.

export const GAME_WIDTH = 1080;
export const GAME_HEIGHT = 1920;

export const TAB_BAR_HEIGHT = 200;
/** Height of the area above the tab bar where stations draw. */
export const PLAY_AREA_HEIGHT = GAME_HEIGHT - TAB_BAR_HEIGHT;

/** Minimum touch target size in logical pixels (see CLAUDE.md, Display). */
export const MIN_HIT_SIZE = 120;
