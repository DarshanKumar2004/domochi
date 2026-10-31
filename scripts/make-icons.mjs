// Render the domochi logo onto cream squares for web-app / home-screen icons.
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
// Usage: npm run icons (re-run whenever public/assets/logo.png changes).
const root = process.cwd();
const logo = 'data:image/png;base64,' + readFileSync(`${root}/public/assets/logo.png`).toString('base64');
mkdirSync(`${root}/public/icons`, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
for (const size of [512, 192, 180, 32]) {
  const data = await page.evaluate(async ([src, size]) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fffaf0';
    ctx.fillRect(0, 0, size, size);
    // Leave a safe margin (maskable icons can be cropped to a circle).
    const pad = size * 0.14;
    const s = size - pad * 2;
    const scale = Math.min(s / img.width, s / img.height);
    const w = img.width * scale, h = img.height * scale;
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    return c.toDataURL('image/png').split(',')[1];
  }, [logo, size]);
  writeFileSync(`${root}/public/icons/icon-${size}.png`, Buffer.from(data, 'base64'));
}
await browser.close();
