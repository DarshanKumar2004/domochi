// The weekly challenge: one goal per real calendar week (Monday to Sunday, the
// same weeks as the trailer's secret word), built up over the days you play
// that week, for a bigger reward. A reason to come back across the week.
// Pure logic, no Phaser.

export type WeeklyKind = 'flavor' | 'great' | 'tidy' | 'stars';

export interface WeeklyBalance {
  reward: number;
  /** Targets by kind. */
  targets: Record<WeeklyKind, number>;
}

export interface WeeklyState {
  week: number;
  kind: WeeklyKind;
  /** For 'flavor': which flavour to serve. */
  flavor?: string;
  target: number;
  progress: number;
  done: boolean;
}

/** What a finished day adds to the challenge. */
export interface WeeklyDay {
  /** Donuts served, by flavour id. */
  flavors: Record<string, number>;
  great: number;
  tidy: boolean;
  stars: number;
}

const KINDS: WeeklyKind[] = ['flavor', 'great', 'stars', 'tidy'];

function mix(n: number): number {
  let h = Math.imul(n ^ 0x2c1b3c6d, 0x297a2d39);
  h ^= h >>> 15;
  return h >>> 0;
}

/**
 * This week's challenge: the one already going, or a new one (its kind picked
 * from the week; a flavour challenge uses a flavour you have).
 */
export function weeklyFor(b: WeeklyBalance, week: number, current: WeeklyState | undefined, flavors: readonly string[]): WeeklyState {
  if (current && current.week === week) return current;
  let kind = KINDS[mix(week) % KINDS.length]!;
  if (kind === 'flavor' && !flavors.length) kind = 'great';
  const flavor = kind === 'flavor' ? flavors[mix(week + 7) % flavors.length] : undefined;
  return { week, kind, ...(flavor ? { flavor } : {}), target: b.targets[kind], progress: 0, done: false };
}

/** Add a finished day. Returns the new state and whether it was just completed. */
export function addWeeklyDay(s: WeeklyState, day: WeeklyDay): { state: WeeklyState; justDone: boolean } {
  if (s.done) return { state: s, justDone: false };
  const add = s.kind === 'flavor' ? (day.flavors[s.flavor ?? ''] ?? 0) : s.kind === 'great' ? day.great : s.kind === 'stars' ? day.stars : day.tidy ? 1 : 0;
  const progress = Math.min(s.target, s.progress + add);
  const done = progress >= s.target;
  return { state: { ...s, progress, done }, justDone: done };
}

/** The challenge in words, e.g. "serve 10 strawberry donuts". */
export function weeklyText(s: WeeklyState, flavorName: (id: string) => string): string {
  switch (s.kind) {
    case 'flavor':
      return `serve ${s.target} ${flavorName(s.flavor ?? '')} donuts`;
    case 'great':
      return `get ${s.target} great reactions`;
    case 'stars':
      return `earn ${s.target} day stars`;
    case 'tidy':
      return `close up spotless ${s.target} days`;
  }
}
