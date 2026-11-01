// The trailer's secret word: each week the real domochi trailer shows a word
// (on the menu board, or told at the window), and typing it into the game
// gives a little reward. It brings players to the real stand. The words are
// worked out from the date, so there's no server and no game update: Ethan
// just needs the calendar (npm run trailer-words). Pure logic, no Phaser.

/** Words that sound like the shop. All lowercase, letters only. */
export const TRAILER_WORDS = [
  'mochi', 'glaze', 'sprinkle', 'beignet', 'chewy', 'ring', 'matcha', 'strawberry', 'cookie', 'hazelnut',
  'sugar', 'golden', 'fluffy', 'drizzle', 'crumble', 'toasty', 'berry', 'cocoa', 'vanilla', 'caramel',
  'honey', 'peach', 'mango', 'lemon', 'coconut', 'almond', 'cinnamon', 'maple', 'sesame', 'taro',
  'yuzu', 'latte', 'cream', 'swirl', 'bubble', 'pastel', 'sunny', 'bayou', 'pecan', 'praline',
  'kingcake', 'fresh', 'dozen', 'trio', 'flight', 'sparkle', 'sweetness', 'greatness', 'pillow', 'bounce',
  'cloud', 'blossom',
] as const;

/** Week 0 starts on this Monday (local time); weeks run Monday to Sunday. */
const EPOCH = { y: 2026, m: 0, d: 5 };
const DAY_MS = 86_400_000;
/** Mixes the week number so the words don't come in list order. */
const SALT = 0x5eed_d0c4;

/** Which trailer week a date falls in. */
export function trailerWeek(now: Date): number {
  const start = Date.UTC(EPOCH.y, EPOCH.m, EPOCH.d);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((today - start) / DAY_MS / 7);
}

/** The Monday a trailer week starts on (local date). */
export function weekStart(week: number): Date {
  return new Date(EPOCH.y, EPOCH.m, EPOCH.d + week * 7);
}

function pick(week: number): number {
  let h = Math.imul(week ^ SALT, 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca77);
  h ^= h >>> 13;
  return (h >>> 0) % TRAILER_WORDS.length;
}

/** The word for a week (never the same as the week before). */
export function trailerWord(week: number): string {
  let i = pick(week);
  if (i === pick(week - 1)) i = (i + 1) % TRAILER_WORDS.length;
  return TRAILER_WORDS[i]!;
}

/** Letters only, lowercase: "King Cake!" → "kingcake". */
export function normalizeWord(input: string): string {
  return input.toLowerCase().replace(/[^a-z]/g, '');
}

/**
 * Check a word typed in the game: this week's, or last week's (a few days'
 * grace for someone who visited on Sunday). Returns the week it belongs to,
 * or null if it isn't a word for either.
 */
export function checkTrailerWord(input: string, now: Date): number | null {
  const w = normalizeWord(input);
  if (!w) return null;
  const week = trailerWeek(now);
  if (w === trailerWord(week)) return week;
  if (w === trailerWord(week - 1)) return week - 1;
  return null;
}
