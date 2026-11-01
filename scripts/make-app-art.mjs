// Source art for the Android app's icon and launch screen, drawn from the
// domochi logo on cream. Then @capacitor/assets makes every size Android needs.
// Usage: npm run app-art (re-run whenever public/assets/logo.png changes).
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const root = process.cwd();
const logo = 'data:image/png;base64,' + readFileSync(`${root}/public/assets/logo.png`).toString('base64');
mkdirSync(`${root}/resources`, { recursive: true });

// [file, size, background (null = transparent), share of the side the logo may use]
const jobs = [
  ['icon-only.png', 1024, '#fffaf0', 0.72],
  // Adaptive icons: Android crops the foreground to a circle or squircle, so keep the logo well inside.
  ['icon-foreground.png', 1024, null, 0.56],
  ['icon-background.png', 1024, '#fffaf0', 0],
  ['splash.png', 2732, '#fffaf0', 0.3],
  ['splash-dark.png', 2732, '#fffaf0', 0.3],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [file, size, bg, share] of jobs) {
  const data = await page.evaluate(
    async ([src, size, bg, share]) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d');
      if (bg) {
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, size, size);
      }
      if (share > 0) {
        const s = size * share;
        const scale = Math.min(s / img.width, s / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      }
      return c.toDataURL('image/png').split(',')[1];
    },
    [logo, size, bg, share],
  );
  writeFileSync(`${root}/resources/${file}`, Buffer.from(data, 'base64'));
}
await browser.close();
console.log('made resources/: icon-only, icon-foreground, icon-background, splash, splash-dark');
