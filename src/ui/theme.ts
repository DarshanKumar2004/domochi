// domochi brand palette, from domochitreats.com and the official logo (2026-10-30):
// the brand itself is black ink + cream/white; colour comes from the food.
// Pink is the strawberry glaze from menu.json, used as the game's accent.
// TODO-BRAND: confirm the accent with Kumar/Ethan; swap the font for the logo's wordmark style.

export const COLORS = {
  bg: 0x1f1a17, // ink (site text colour)
  cream: 0xfffaf0, // site cream
  dough: 0xe8c28a,
  doughEdge: 0xb8854a,
  pink: 0xf4a6c0, // strawberry glaze
  pinkDark: 0xd77a9a,
  brown: 0x5a3e2b,
  ink: 0x1f1a17,
  sky: 0xbfe3f2,
  asphalt: 0x6b6f73,
  tabBar: 0x2b2522,
  card: 0xfffaf0,
  skin: 0xf1c27d,
  shirt: 0x1f1a17, // Ethan in black, matching the brand
  danger: 0xeba3a3,
} as const;

export const CSS = {
  cream: '#fffaf0',
  pink: '#f4a6c0',
  ink: '#1f1a17',
  muted: '#b8aea4',
} as const;

export const FONT_FAMILY = '"Arial Rounded MT Bold", "Trebuchet MS", Arial, sans-serif';
