import { defineConfig, type Plugin } from 'vitest/config';

/**
 * A Content-Security-Policy for the built game (the website and the app; the
 * dev server needs more for live reload). The page may only run its own code,
 * and only talk to the feedback relay and the game's website (news.json): an
 * injected script, if a bug ever let one in, couldn't load or send anything.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://domochi-feedback.kumardarshan425.workers.dev https://darshankumar2004.github.io",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

function contentSecurityPolicy(): Plugin {
  return {
    name: 'domochi-csp',
    apply: 'build',
    transformIndexHtml: (html) => html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
  };
}

export default defineConfig({
  // Relative base so the build works on GitHub Pages subpaths and inside Capacitor.
  base: './',
  plugins: [contentSecurityPolicy()],
  build: {
    // Hashed JS/CSS go in build/ (their names change with every build); public/assets/ keeps the game's art.
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
