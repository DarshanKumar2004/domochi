import type { DaySnapshot } from './GameSession';
import type { WeeklyState } from './weekly';
import type { JournalPage } from './journal';
/**
 * Async key-value storage. Async so it can be backed by Capacitor Preferences
 * later without changing SaveService or any scene.
 */
export interface SaveStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export const SAVE_KEY = 'domochi.save';
export const SAVE_VERSION = 1;

export interface SaveData {
  version: number;
  tutorialDone: boolean;
  /** The day you're on (the next one to play). */
  day: number;
  /** Money banked from finished days (sales + tips). */
  money: number;
  /** Customers served over all finished days. */
  served: number;
  /** Best single order score so far (0–100). */
  bestOrder: number;
  /** A pop-up event you accepted, and the day it's on. */
  event?: { id: string; day: number };
  /** Supplies on hand (balance.supplies ids). Missing: a new game's starting stock. */
  stock?: Record<string, number>;
  /** Glaze guides bought at the supply store (balance.guides ids). */
  guides: string[];
  /** Decorations for the lot (balance.decor ids). */
  decor: string[];
  /** Your crew (balance.staff hire ids), and when you were last here (ms since 1970), for what they made meanwhile. */
  staff: string[];
  lastSeen?: number;
  /** What the player told mochi to call them (when they joined the team). */
  playerName: string;
  /** mochi's daily gift: the last day it was given, and days in a row. */
  daily?: { last: string; streak: number };
  /** Trailer weeks whose secret word has been claimed (the newest few). */
  trailerWeeks?: number[];
  /** This week's challenge and how far along it is. */
  weekly?: WeeklyState;
  /** A random id for this save (coupon codes are tied to it); made when first needed. */
  playerId: string;
  /** How well each regular knows you (customers.json regulars ids). */
  regulars: Record<string, number>;
  /** Kinds (kolache, onigiri) whose starter kit has arrived (once each, the day they first come on the menu). */
  sidesStarted?: string[];
  /** Stations whose one-time hint from mochi has been shown (scene keys). */
  hintsSeen?: string[];
  /** The day being played, saved as you go so a reload picks it back up (gone once the day's done). */
  inProgress?: { day: number; snap: DaySnapshot; stickers: string[] };
  /** The trays as the last day left them (mess not cleaned up, and days dirty: mold). */
  trays?: { glaze: number; toppings: number; bowl?: boolean; mold: { glaze: number; toppings: number; bowl?: number } };
  /** mochi's journal: stickers earned (ids, in order) and a page per finished day. */
  journal: { stickers: string[]; pages: JournalPage[]; seen: number };
  settings: {
    sound: boolean;
    music: boolean;
    /** The Android app's screen: locked landscape (the default), portrait, or turning with the phone. */
    orientation?: 'landscape' | 'portrait' | 'auto';
    /** Volume sliders, 0–1 (half by default). */
    musicVolume?: number;
    soundVolume?: number;
  };
}

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    tutorialDone: false,
    day: 1,
    money: 0,
    served: 0,
    bestOrder: 0,
    guides: [],
    decor: [],
    staff: [],
    playerId: '',
    playerName: '',
    regulars: {},
    journal: { stickers: [], pages: [], seen: 0 },
    settings: { sound: true, music: true },
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Builds valid SaveData from anything parsed out of storage. Fields that are
 * missing or have the wrong type fall back to defaults, so a corrupt or older
 * save never crashes the game.
 */
export function sanitizeSave(raw: unknown): SaveData {
  const data = defaultSave();
  if (!isRecord(raw)) return data;

  if (typeof raw.tutorialDone === 'boolean') data.tutorialDone = raw.tutorialDone;
  if (typeof raw.day === 'number' && Number.isInteger(raw.day) && raw.day >= 1) data.day = raw.day;
  if (typeof raw.money === 'number' && Number.isFinite(raw.money) && raw.money >= 0) data.money = raw.money;
  if (typeof raw.served === 'number' && Number.isInteger(raw.served) && raw.served >= 0) data.served = raw.served;
  if (typeof raw.bestOrder === 'number' && raw.bestOrder >= 0 && raw.bestOrder <= 100) data.bestOrder = raw.bestOrder;
  if (isRecord(raw.event) && typeof raw.event.id === 'string' && typeof raw.event.day === 'number' && Number.isInteger(raw.event.day)) {
    data.event = { id: raw.event.id, day: raw.event.day };
  }

  if (isRecord(raw.stock)) {
    const stock: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw.stock)) if (typeof v === 'number' && Number.isInteger(v) && v >= 0) stock[k] = v;
    data.stock = stock;
  }
  if (Array.isArray(raw.guides)) data.guides = [...new Set(raw.guides.filter((g): g is string => typeof g === 'string'))];
  if (Array.isArray(raw.staff)) data.staff = [...new Set(raw.staff.filter((g): g is string => typeof g === 'string'))];
  if (typeof raw.playerName === 'string') data.playerName = raw.playerName.trim().slice(0, 24);
  if (typeof raw.playerId === 'string' && raw.playerId) data.playerId = raw.playerId.slice(0, 32);
  if (typeof raw.lastSeen === 'number' && Number.isFinite(raw.lastSeen)) data.lastSeen = raw.lastSeen;
  if (Array.isArray(raw.decor)) data.decor = [...new Set(raw.decor.filter((g): g is string => typeof g === 'string'))];
  if (Array.isArray(raw.hintsSeen)) data.hintsSeen = [...new Set(raw.hintsSeen.filter((g): g is string => typeof g === 'string'))];
  if (Array.isArray(raw.sidesStarted)) data.sidesStarted = [...new Set(raw.sidesStarted.filter((g): g is string => typeof g === 'string'))];
  if (isRecord(raw.regulars)) {
    for (const [k, v] of Object.entries(raw.regulars)) if (typeof v === 'number' && Number.isInteger(v) && v >= 0) data.regulars[k] = v;
  }
  const ip = raw.inProgress;
  if (isRecord(ip) && typeof ip.day === 'number' && isRecord(ip.snap) && ip.snap.v === 1 && Array.isArray(ip.snap.customers) && Array.isArray(ip.snap.tickets)) {
    data.inProgress = { day: ip.day, snap: ip.snap as unknown as DaySnapshot, stickers: Array.isArray(ip.stickers) ? ip.stickers.filter((s): s is string => typeof s === 'string') : [] };
  }
  if (isRecord(raw.journal)) {
    const j = raw.journal;
    if (Array.isArray(j.stickers)) data.journal.stickers = [...new Set(j.stickers.filter((s): s is string => typeof s === 'string'))];
    if (Array.isArray(j.pages)) {
      data.journal.pages = j.pages.filter(
        (p): p is JournalPage => isRecord(p) && typeof p.day === 'number' && typeof p.served === 'number' && typeof p.best === 'number' && Array.isArray(p.stickers) && typeof p.note === 'string',
      );
    }
    if (typeof j.seen === 'number' && j.seen >= 0) data.journal.seen = Math.floor(j.seen);
  }

  if (isRecord(raw.trays) && isRecord(raw.trays.mold)) {
    const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
    data.trays = {
      glaze: n(raw.trays.glaze),
      toppings: n(raw.trays.toppings),
      bowl: raw.trays.bowl === true,
      mold: { glaze: Math.floor(n(raw.trays.mold.glaze)), toppings: Math.floor(n(raw.trays.mold.toppings)), bowl: Math.floor(n(raw.trays.mold.bowl)) },
    };
  }
  if (isRecord(raw.daily) && typeof raw.daily.last === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.daily.last) && typeof raw.daily.streak === 'number') {
    data.daily = { last: raw.daily.last, streak: Math.max(1, Math.floor(raw.daily.streak)) };
  }
  if (isRecord(raw.weekly) && Number.isInteger(raw.weekly.week) && ['flavor', 'great', 'stars', 'tidy'].includes(raw.weekly.kind as string)) {
    const w = raw.weekly;
    data.weekly = {
      week: w.week as number,
      kind: w.kind as WeeklyState['kind'],
      ...(typeof w.flavor === 'string' ? { flavor: w.flavor } : {}),
      target: typeof w.target === 'number' && w.target > 0 ? w.target : 1,
      progress: typeof w.progress === 'number' && w.progress >= 0 ? w.progress : 0,
      done: w.done === true,
    };
  }
  if (Array.isArray(raw.trailerWeeks)) data.trailerWeeks = raw.trailerWeeks.filter((w): w is number => Number.isInteger(w)).slice(-60);
  if (isRecord(raw.settings)) {
    if (typeof raw.settings.sound === 'boolean') data.settings.sound = raw.settings.sound;
    if (typeof raw.settings.music === 'boolean') data.settings.music = raw.settings.music;
    for (const k of ['musicVolume', 'soundVolume'] as const) {
      const v = raw.settings[k];
      if (typeof v === 'number' && v >= 0 && v <= 1) data.settings[k] = v;
    }
    const o = raw.settings.orientation;
    if (o === 'landscape' || o === 'portrait' || o === 'auto') data.settings.orientation = o;
  }
  return data;
}

/**
 * Holds the save in memory (so reads are synchronous) and writes it through to
 * storage on every change. Writes are chained so they land in order.
 */
export class SaveService {
  private state: SaveData;
  private writeChain: Promise<void> = Promise.resolve();

  private constructor(
    private readonly storage: SaveStorage,
    private readonly key: string,
    initial: SaveData,
  ) {
    this.state = initial;
  }

  static async load(storage: SaveStorage, key: string = SAVE_KEY): Promise<SaveService> {
    let raw: string | null = null;
    try {
      raw = await storage.get(key);
    } catch (e) {
      console.warn('[SaveService] could not read save, starting fresh', e);
    }

    let parsed: unknown = null;
    if (raw !== null) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        console.warn('[SaveService] save was not valid JSON, starting fresh');
      }
    }
    return new SaveService(storage, key, sanitizeSave(parsed));
  }

  get data(): Readonly<SaveData> {
    return this.state;
  }

  /** Change the save and persist it. Resolves once the write has finished. */
  update(mutate: (draft: SaveData) => void): Promise<void> {
    mutate(this.state);
    return this.persist();
  }

  reset(): Promise<void> {
    this.state = defaultSave();
    return this.persist();
  }

  private persist(): Promise<void> {
    const json = JSON.stringify(this.state);
    this.writeChain = this.writeChain
      .then(() => this.storage.set(this.key, json))
      .catch((e: unknown) => console.warn('[SaveService] could not write save', e));
    return this.writeChain;
  }
}
