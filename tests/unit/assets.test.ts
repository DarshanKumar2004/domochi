import { describe, expect, it } from 'vitest';
import manifest from '../../assets/MANIFEST.md?raw';
import { AnimKeys, TextureKeys } from '../../src/assets/keys';
import { GAME_WIDTH, MIN_HIT_SIZE } from '../../src/ui/layout';
import { STATION_TABS } from '../../src/ui/tabs';

describe('assets/MANIFEST.md', () => {
  it.each([...Object.values(TextureKeys), ...Object.values(AnimKeys)])('documents key "%s"', (key) => {
    expect(manifest).toContain(`\`${key}\``);
  });
});

describe('tab bar', () => {
  it('gives every tab a hit target of at least MIN_HIT_SIZE', () => {
    expect(GAME_WIDTH / STATION_TABS.length).toBeGreaterThanOrEqual(MIN_HIT_SIZE);
  });

  it('has unique scenes', () => {
    const scenes = STATION_TABS.map((t) => t.scene);
    expect(new Set(scenes).size).toBe(scenes.length);
  });
});
