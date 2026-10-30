import type { SaveService } from './SaveService';

// Game-wide services, set up once in main.ts before Phaser starts.

let saveService: SaveService | null = null;

export function setSave(s: SaveService): void {
  saveService = s;
}

export function save(): SaveService {
  if (!saveService) throw new Error('SaveService used before main.ts initialised it');
  return saveService;
}
