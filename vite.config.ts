import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the build works on GitHub Pages subpaths and inside Capacitor.
  base: './',
  build: {
    // Hashed JS/CSS go in build/ (cached forever by netlify.toml); public/assets/ keeps the game's art.
    assetsDir: 'build',
    // One bundle is fine for a game: about 400 KB gzipped, mostly Phaser.
    chunkSizeWarningLimit: 2000,
  },
  server: {
    port: 5173,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
