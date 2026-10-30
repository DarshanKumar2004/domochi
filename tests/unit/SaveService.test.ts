import { describe, expect, it, vi } from 'vitest';
import { SAVE_KEY, SaveService, defaultSave, sanitizeSave, type SaveStorage } from '../../src/systems/SaveService';
import { MemoryStorage } from '../../src/systems/storage';

describe('SaveService', () => {
  it('starts with defaults when nothing is saved', async () => {
    const s = await SaveService.load(new MemoryStorage());
    expect(s.data).toEqual(defaultSave());
    expect(s.data.tutorialDone).toBe(false);
    expect(s.data.day).toBe(1);
  });

  it('persists updates so a fresh load sees them', async () => {
    const storage = new MemoryStorage();
    const first = await SaveService.load(storage);
    await first.update((d) => {
      d.tutorialDone = true;
      d.money = 42.5;
    });

    const second = await SaveService.load(storage);
    expect(second.data.tutorialDone).toBe(true);
    expect(second.data.money).toBe(42.5);
  });

  it('reset restores defaults and persists them', async () => {
    const storage = new MemoryStorage();
    const s = await SaveService.load(storage);
    await s.update((d) => {
      d.day = 7;
    });
    await s.reset();
    expect(s.data).toEqual(defaultSave());
    expect((await SaveService.load(storage)).data.day).toBe(1);
  });

  it('falls back to defaults on corrupt JSON', async () => {
    const storage = new MemoryStorage();
    await storage.set(SAVE_KEY, '{not json');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const s = await SaveService.load(storage);
    expect(s.data).toEqual(defaultSave());
  });

  it('keeps working in memory when storage throws', async () => {
    const broken: SaveStorage = {
      get: () => Promise.reject(new Error('blocked')),
      set: () => Promise.reject(new Error('blocked')),
      remove: () => Promise.reject(new Error('blocked')),
    };
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const s = await SaveService.load(broken);
    await expect(
      s.update((d) => {
        d.tutorialDone = true;
      }),
    ).resolves.toBeUndefined();
    expect(s.data.tutorialDone).toBe(true);
  });

  it('writes land in order', async () => {
    const storage = new MemoryStorage();
    const s = await SaveService.load(storage);
    void s.update((d) => {
      d.day = 2;
    });
    void s.update((d) => {
      d.day = 3;
    });
    await s.update((d) => {
      d.day = 4;
    });
    expect(JSON.parse((await storage.get(SAVE_KEY)) ?? '{}').day).toBe(4);
  });
});

describe('sanitizeSave', () => {
  it('keeps valid fields and replaces invalid ones with defaults', () => {
    const d = sanitizeSave({
      tutorialDone: true,
      day: 0, // invalid: days start at 1
      money: -5, // invalid: negative
      settings: { sound: false, music: 'loud' },
      extra: 'ignored',
    });
    expect(d.tutorialDone).toBe(true);
    expect(d.day).toBe(1);
    expect(d.money).toBe(0);
    expect(d.settings).toEqual({ sound: false, music: true });
    expect(d).not.toHaveProperty('extra');
  });

  it.each([null, 5, 'save', [1, 2]])('returns defaults for non-object %p', (raw) => {
    expect(sanitizeSave(raw)).toEqual(defaultSave());
  });
});
