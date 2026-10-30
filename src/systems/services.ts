import balanceJson from '../data/balance.json';
import customersJson from '../data/customers.json';
import menuJson from '../data/menu.json';
import type { Balance } from './balance';
import type { CustomersData } from './customers';
import { GameSession } from './GameSession';
import type { Menu } from './menu';
import { createRng, randomSeed } from './rng';
import type { SaveService } from './SaveService';

// Game-wide services, set up once in main.ts before Phaser starts.

export const menu = menuJson as Menu;
export const customersData = customersJson as CustomersData;
export const balance = balanceJson as Balance;

let saveService: SaveService | null = null;
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

export function save(): SaveService {
  if (!saveService) throw new Error('SaveService used before main.ts initialised it');
  return saveService;
}

/** Fix the random seed (from ?seed= in the URL) so a session is reproducible. */
export function setSeed(seed: number | null): void {
  seedOverride = seed;
}

/** Start a fresh day at the trailer. */
export function startSession(day: number): GameSession {
  currentSession = new GameSession({
    menu,
    customers: customersData,
    balance,
    day,
    rng: createRng(seedOverride ?? randomSeed()),
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
