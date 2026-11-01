import Phaser from 'phaser';
import { TextureKeys } from '../assets/keys';
import brand from '../data/brand.json';
import type { FinishedDonut } from '../stations/toppings';
import { drawFinishedDonut } from './donutArt';
import { isNative, shareImageNative } from '../systems/native';
import { CSS, FONT_FAMILY } from './theme';

/** Share card size: 4:5, the shape Instagram posts like. */
const W = 1080;
const H = 1350;

export interface ShareCard {
  donut: FinishedDonut;
  /** e.g. "my strawberry mochi donut" */
  title: string;
  /** e.g. "score 94 · great!" */
  subtitle: string;
}

/**
 * A picture of a donut you made, on a cream card with the domochi logo, the
 * shop's handle and website, and where to play. Returns a PNG blob.
 */
export async function renderShareCard(scene: Phaser.Scene, card: ShareCard): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Cream card with an ink frame and halftone dots, like the logo.
  ctx.fillStyle = '#fbf6ec';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(31, 26, 23, 0.06)';
  for (let y = 20; y < H; y += 34) for (let x = (y / 34) % 2 ? 37 : 20; x < W; x += 34) ctx.fillRect(x, y, 6, 6);
  ctx.strokeStyle = CSS.ink;
  ctx.lineWidth = 14;
  ctx.strokeRect(30, 30, W - 60, H - 60);

  // The logo at the top (it's ink on transparent, so it needs the light card).
  const logo = scene.textures.get(TextureKeys.Logo).getSourceImage() as CanvasImageSource;
  ctx.drawImage(logo, W / 2 - 150, 60, 300, 300);

  // The donut, big, with a soft shadow.
  const size = 700;
  const art = document.createElement('canvas');
  art.width = size;
  art.height = size;
  drawFinishedDonut(art.getContext('2d')!, size, card.donut);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
  ctx.beginPath();
  ctx.ellipse(W / 2, 410 + size * 0.86, size * 0.36, 34, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.drawImage(art, W / 2 - size / 2, 380);

  const text = (s: string, y: number, px: number, weight = 'normal', color: string = CSS.ink) => {
    ctx.font = `${weight} ${px}px ${FONT_FAMILY}`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.fillText(s, W / 2, y, W - 120);
  };
  text(card.title, 1130, 56, 'bold');
  text(card.subtitle, 1190, 40, 'normal', '#6b5d52');
  text(`${brand.instagram} · ${brand.website.replace(/^https?:\/\/(www\.)?/, '')}`, 1262, 34, 'bold', '#b0406a');
  text('made in the domochi donut game', 1300, 28, 'normal', '#6b5d52');

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('no image'))), 'image/png'));
}

/**
 * Share the card: the phone's share sheet when it can share pictures,
 * otherwise download it. Returns what happened.
 */
export async function shareDonut(scene: Phaser.Scene, card: ShareCard): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const blob = await renderShareCard(scene, card);
  // In the Android app the share sheet needs a file.
  if (isNative()) return shareImageNative(blob, 'my-domochi-donut.png', card.title, `${card.title}! ${brand.instagram}`).catch(() => 'cancelled' as const);
  const file = new File([blob], 'my-domochi-donut.png', { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: card.title, text: `${card.title}! ${brand.instagram}` });
      return 'shared';
    } catch {
      return 'cancelled';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return 'downloaded';
}
