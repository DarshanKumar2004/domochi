// mochi's journal: stickers earned for little moments, and a page for every
// day. Pure logic, no Phaser: the tracker listens to a day's session and says
// when a sticker is earned; the scenes show it and the save keeps it.
import type { DaySummary, GameSession } from './GameSession';
import { pickLine } from './customers';
import { Emitter } from './events';
import type { Rng } from './rng';

export interface StickerDef {
  id: string;
  name: string;
  desc: string;
  /** CSS colour of the sticker. */
  color: string;
  /** A character or two drawn on it. */
  glyph: string;
  /** Shown as '?' until earned. */
  secret?: boolean;
}

export interface JournalData {
  stickers: StickerDef[];
  notes: Record<'great' | 'good' | 'rough' | 'quiet', string[]>;
}

/** One day's page. */
export interface JournalPage {
  day: number;
  weather?: string;
  event?: string;
  served: number;
  best: number;
  profit?: number;
  /** Stickers earned that day. */
  stickers: string[];
  /** mochi's note. */
  note: string;
  /** A little picture of the day's best donut (a PNG data URL). */
  doodle?: string;
  /** How the day went, 0–3 stars. */
  stars?: number;
}

/**
 * Stars for a day: none if nobody was served, then one, two for a good day
 * (average 65+), three for a great one (average 85+ with 5 or more served).
 */
export function dayStars(sum: { served: number; averageScore: number }): number {
  if (sum.served === 0) return 0;
  if (sum.averageScore >= 85 && sum.served >= 5) return 3;
  if (sum.averageScore >= 65) return 2;
  return 1;
}

/** ★★☆ */
export function starText(n: number): string {
  return '★'.repeat(n) + '☆'.repeat(Math.max(0, 3 - n));
}

/** Things the tracker needs beyond the session. */
export interface TrackerContext {
  /** Today's weather id. */
  weather?: string;
  /** Glaze guides owned and how many there are (for "by the book"). */
  guidesOwned: () => number;
  guideCount: number;
}

export interface TrackerEvents extends Record<string, unknown> {
  earned: StickerDef;
}

/** Thresholds (kept here: they're the stickers' rules, named in journal.json's descriptions). */
const GOLDEN_FRY = 98;
const PERFECT_ORDER = 95;
const SPEEDY_MS = 45_000;
const BUSY = 10;
const WEATHER_SERVES = 5;
const ZERO_WASTE_MIN = 3;
const WEEK = 7;

/**
 * Watches one day and awards stickers. `owned` is every sticker earned so far
 * (it's added to as new ones come in); `today` lists the ones earned today.
 */
export class StickerTracker {
  readonly events = new Emitter<TrackerEvents>();
  readonly today: string[] = [];
  private lastTier: string | null = null;
  private servedToday = 0;
  private readonly offs: (() => void)[] = [];

  constructor(
    private readonly data: JournalData,
    private readonly owned: Set<string>,
    private readonly ctx: TrackerContext,
  ) {}

  has(id: string): boolean {
    return this.owned.has(id);
  }

  /** Earn a sticker (once ever). Returns true if it's new. */
  award(id: string): boolean {
    const def = this.data.stickers.find((s) => s.id === id);
    if (!def || this.owned.has(id)) return false;
    this.owned.add(id);
    this.today.push(id);
    this.events.emit('earned', def);
    return true;
  }

  /** Listen to a day's session. */
  watch(s: GameSession): void {
    const ev = s.events;
    this.offs.push(
      ev.on('served', (e) => this.onServed(e.score.total, e.score.tier, e.score.gifts, e.waitMs)),
      ev.on('pulled', (e) => {
        if (e.score >= GOLDEN_FRY) this.award('golden');
      }),
      ev.on('dropped', (e) => {
        if (e.frying >= e.slots) this.award('full-house');
      }),
      ev.on('doughMade', (e) => {
        if (e.quality >= 1) this.award('dough-perfect');
      }),
      ev.on('usual', () => this.award('regular')),
      ev.on('streak', (e) => {
        if (e.count >= 5) this.award('streak');
      }),
      ev.on('served', (e) => {
        if (s.specialsSold >= 5) this.award('special');
        void e;
      }),
      ev.on('friend', () => this.award('friends')),
    );
  }

  private onServed(total: number, tier: string, gifts: number, waitMs: number): void {
    this.servedToday++;
    this.award('first-order');
    if (tier === 'great') this.award('great');
    if (total >= PERFECT_ORDER) this.award('perfect-order');
    if (gifts > 0) this.award('gift');
    // "Speedy" needs a real order, not an empty box handed over.
    if (waitMs <= SPEEDY_MS && total >= 50) this.award('speedy');
    if (tier === 'great' && this.lastTier === 'bad') this.award('comeback');
    this.lastTier = tier;
    if (this.servedToday >= BUSY) this.award('busy');
    if (this.servedToday >= WEATHER_SERVES && (this.ctx.weather === 'rainy' || this.ctx.weather === 'hot')) this.award(this.ctx.weather);
  }

  /** Stop listening. */
  detach(): void {
    for (const off of this.offs.splice(0)) off();
  }

  /** Bought something at the store: maybe now every guide is yours. */
  checkGuides(): void {
    if (this.ctx.guidesOwned() >= this.ctx.guideCount) this.award('guides');
  }

  /** End of the day: the stickers that look at the whole day. */
  endOfDay(sum: DaySummary, countsWaste: boolean): void {
    this.award('first-day');
    if (sum.tidy) this.award('tidy');
    if (countsWaste && sum.served >= ZERO_WASTE_MIN && sum.wasted === 0) this.award('zero-waste');
    if (sum.event) this.award('pop-up');
    if (sum.day >= WEEK) this.award('week');
  }
}

/** mochi's note for the day's page. */
export function dayNote(data: JournalData, sum: DaySummary, rng: Rng): string {
  const kind = sum.served === 0 ? 'quiet' : sum.averageScore >= 80 ? 'great' : sum.averageScore >= 50 ? 'good' : 'rough';
  return pickLine(data.notes[kind], rng, { served: sum.served, best: sum.bestScore });
}

/** Most pages that keep their doodle (older ones keep their words): the save stays small. */
export const DOODLE_PAGES = 60;

/** Add a page (replacing that day's if it's there) and drop doodles from very old pages. */
export function addPage(pages: JournalPage[], page: JournalPage): JournalPage[] {
  const out = pages.filter((p) => p.day !== page.day);
  out.push(page);
  out.sort((a, b) => a.day - b.day);
  for (let i = 0; i < out.length - DOODLE_PAGES; i++) delete out[i]!.doodle;
  return out;
}
