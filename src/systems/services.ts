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
  currentSession = new GameSession({
    menu,
    customers: customersData,
    balance,
    day,
    rng: createRng(seedOverride ?? randomSeed()),
    ...(opts.tutorial
      ? { script: { orders: [{ flavors, boxId: boxFor(menu, flavors.length).id }] }, trackDough: true }
      : { dayFlow: true, events: popupEvents, stock: fillStock(saveService?.data.stock, balance.supplies), ...(event ? { event } : {}) }),
  });
  return currentSession;
}

export function session(): GameSession {
  if (!currentSession) throw new Error('no session: startMainGame() starts one');
  return currentSession;
}

export function hasSession(): boolean {
  return currentSession !== null;
}
