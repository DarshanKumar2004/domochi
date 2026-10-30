import type { SaveStorage } from './SaveService';

/** In-memory storage: used in tests and when localStorage is unavailable. */
export class MemoryStorage implements SaveStorage {
  private readonly map = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.map.get(key) ?? null;
  }
  async set(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }
  async remove(key: string): Promise<void> {
    this.map.delete(key);
  }
}

/** Browser localStorage. Swap for a Capacitor Preferences adapter in Phase 8. */
export class LocalStorageStorage implements SaveStorage {
  constructor(private readonly ls: Storage) {}

  async get(key: string): Promise<string | null> {
    return this.ls.getItem(key);
  }
  async set(key: string, value: string): Promise<void> {
    this.ls.setItem(key, value);
  }
  async remove(key: string): Promise<void> {
    this.ls.removeItem(key);
  }
}

/**
 * localStorage if it works, otherwise memory. Some browsers (private modes,
 * blocked storage) throw on access, and the game should still run.
 */
export function createDefaultStorage(): SaveStorage {
  try {
    const ls = globalThis.localStorage;
    const probe = '__domochi_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return new LocalStorageStorage(ls);
  } catch {
    console.warn('[storage] localStorage unavailable, progress will not be saved');
    return new MemoryStorage();
  }
}
