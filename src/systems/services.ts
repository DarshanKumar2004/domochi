import balanceJson from '../data/balance.json';
import customersJson from '../data/customers.json';
import menuJson from '../data/menu.json';
import tutorialData from '../data/tutorial.json';
import eventsJson from '../data/events.json';
import type { Balance } from './balance';
import type { CustomersData } from './customers';
import { GameSession, type PopupEvent } from './GameSession';
import type { Menu } from './menu';
import { boxFor } from './orders';
import { createRng, randomSeed } from './rng';
import { AudioService } from './AudioService';
import type { SaveService } from './SaveService';
import { fillStock } from './supplies';
import { awayEarnings } from './staff';
import journalJson from '../data/journal.json';
import { StickerTracker, type JournalData } from './journal';
import { weatherFor } from './weather';
import brandJson from '../data/brand.json';
import { FeedbackService } from './FeedbackService';

// Game-wide services, set up once in main.ts before Phaser starts.

export const menu = menuJson as Menu;
export const customersData = customersJson as CustomersData;
export const balance = balanceJson as Balance;
export const popupEvents = eventsJson.events as PopupEvent[];

let saveService: SaveService | null = null;
let audioService: AudioService | null = null;
let currentSession: GameSession | null = null;
let seedOverride: number | null = null;
let clockPaused = false;

/** Tests pause the real-time clock and drive time with session().tick() instead. */
export function setClockPaused(paused: boolean): void {
  clockPaused = paused;
}

export function isClockPaused(): boolean {
  return clockPaused;
}

export function setSave(s: SaveService): void {
  saveService = s;
}

/** Sound and music (made on first use, with the saved settings; silent until unlocked by a tap). */
export function audio(): AudioService {
  if (!audioService) {
    const s = saveService?.data.settings ?? { sound: true, music: true };
    audioService = new AudioService({ sound: s.sound, music: s.music });
  }
  return audioService;
}

export function save(): SaveService {
  if (!saveService) throw new Error('SaveService used before main.ts initialised it');
  return saveService;
}

/** Fix the random seed (from ?seed= in the URL) so a session is reproducible. */
export function setSeed(seed: number | null): void {
  seedOverride = seed;
}

/**
 * Start a fresh day at the trailer: morning prep, the day, and closing (or a
 * pop-up booth, if you accepted an invite for today). A tutorial day has one
 * scripted customer whose order (from tutorial.json) goes through every
 * station, and skips prep and closing.
 */
export function startSession(day: number, opts: { tutorial?: boolean } = {}): GameSession {
  const flavors = [...tutorialData.order];
  const booked = saveService?.data.event;
  const event = !opts.tutorial && booked?.day === day ? popupEvents.find((e) => e.id === booked.id) : undefined;
  const weather = weatherFor(day, balance.weather);
  currentSession = new GameSession({
    menu,
    customers: customersData,
    balance,
    day,
    rng: createRng(seedOverride ?? randomSeed()),
    ...(opts.tutorial
      ? { script: { orders: [{ flavors, boxId: boxFor(menu, flavors.length).id }] }, trackDough: true }
      : {
          dayFlow: true,
          events: popupEvents,
          stock: fillStock(saveService?.data.stock, balance.supplies),
          weather,
          regulars: { ...(saveService?.data.regulars ?? {}) },
          decor: [...(saveService?.data.decor ?? [])],
          bank: () => saveService?.data.money ?? 0,
          ...(event ? { event } : {}),
        }),
  });
  // A day that was in progress (the page reloaded, or the phone dropped it) picks up where it was.
  const ip = saveService?.data.inProgress;
  let resumedStickers: string[] = [];
  if (!opts.tutorial && ip?.day === day) {
    try {
      currentSession.restore(ip.snap);
      resumedStickers = ip.stickers;
    } catch {
      // A save from an older version that doesn't fit: start the day fresh.
    }
  }
  // mochi's journal watches every real day (not the tutorial).
  currentTracker?.detach();
  currentTracker = null;
  if (!opts.tutorial && saveService) {
    const s = saveService;
    currentTracker = new StickerTracker(journalData, new Set(s.data.journal.stickers), {
      weather: weather.id,
      guidesOwned: () => s.data.guides.length,
      guideCount: balance.guides.items.length,
    });
    currentTracker.watch(currentSession);
    currentTracker.today.push(...resumedStickers);
    // Earned stickers are saved straight away.
    currentTracker.events.on('earned', (st) => void s.update((d) => void (d.journal.stickers.includes(st.id) || d.journal.stickers.push(st.id))));
  }
  return currentSession;
}

export const journalData = journalJson as JournalData;
let currentTracker: StickerTracker | null = null;

let feedbackService: FeedbackService | null = null;

/** Players' notes for Ethan (kept on the device, sent as a daily report). */
export function feedback(): FeedbackService {
  if (!feedbackService) {
    const store = {
      get: (k: string) => {
        try {
          return localStorage.getItem(k);
        } catch {
          return null;
        }
      },
      set: (k: string, v: string) => {
        try {
          localStorage.setItem(k, v);
        } catch {
          // Storage full or blocked: the note is lost, nothing else breaks.
        }
      },
    };
    // Only the built game sends: the dev server and the tests keep notes queued (no stray emails).
    const endpoint = import.meta.env.PROD ? ((brandJson as { feedbackEndpoint?: string }).feedbackEndpoint ?? '') : '';
    feedbackService = new FeedbackService(store, endpoint);
  }
  return feedbackService;
}

/**
 * Back from being away: what the crew made meanwhile (banked straight away),
 * and remember that you're here now. Returns the amount and who's on the crew.
 */
export function collectAwayEarnings(now = Date.now()): { amount: number; hours: number; crew: string[] } {
  const s = saveService;
  if (!s) return { amount: 0, hours: 0, crew: [] };
  const last = s.data.lastSeen;
  const hours = last ? Math.max(0, (now - last) / 3_600_000) : 0;
  const amount = awayEarnings(balance.staff, s.data.staff, hours);
  const crew = balance.staff.hires.filter((h) => s.data.staff.includes(h.id)).map((h) => (h.player ? s.data.playerName || 'you' : h.name));
  void s.update((d) => {
    d.lastSeen = now;
    if (amount > 0) d.money = Math.round((d.money + amount) * 100) / 100;
  });
  return { amount, hours, crew };
}

/** Note that the player is here (so time away is counted from now). */
export function markSeen(now = Date.now()): void {
  void saveService?.update((d) => void (d.lastSeen = now));
}

/** Save the day so far (not the tutorial, and not once it's over). */
export function saveDayInProgress(): void {
  const s = currentSession;
  if (!s || s.isTutorial || !saveService || s.phase === 'closed' || !s.tracksSupplies) return;
  const snap = s.snapshot();
  const stickersToday = [...(currentTracker?.today ?? [])];
  void saveService.update((d) => void (d.inProgress = { day: s.day, snap, stickers: stickersToday }));
}

/** Today's sticker tracker (null on the tutorial day). */
export function stickers(): StickerTracker | null {
  return currentTracker;
}

export function session(): GameSession {
  if (!currentSession) throw new Error('no session: startMainGame() starts one');
  return currentSession;
}

export function hasSession(): boolean {
  return currentSession !== null;
}
