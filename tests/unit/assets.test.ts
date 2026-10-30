import { describe, expect, it } from 'vitest';
import manifest from '../../assets/MANIFEST.md?raw';
import { AnimKeys, TextureKeys } from '../../src/assets/keys';
import { MIN_HIT_SIZE, SAFE_SHORT } from '../../src/ui/layout';
import { STATION_TABS } from '../../src/ui/tabs';

describe('assets/MANIFEST.md', () => {
  it.each([...Object.values(TextureKeys), ...Object.values(AnimKeys)])('documents key "%s"', (key) => {
    expect(manifest).toContain(`\`${key}\``);
  });
});

describe('tab bar', () => {
  it('gives every tab a hit target of at least MIN_HIT_SIZE', () => {
    // Narrowest case: portrait, where tabs share the 1080 px short side.
    expect(SAFE_SHORT / STATION_TABS.length).toBeGreaterThanOrEqual(MIN_HIT_SIZE);
  });

  it('has unique scenes', () => {
    const scenes = STATION_TABS.map((t) => t.scene);
    expect(new Set(scenes).size).toBe(scenes.length);
  });
});
