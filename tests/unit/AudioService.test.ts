import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioService, type Sfx } from '../../src/systems/AudioService';

/** A stand-in AudioContext that counts the sounds made. */
function fakeContext() {
  const param = () => ({ value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
  const node = () => ({ connect: vi.fn((n: unknown) => n), gain: param(), frequency: param(), type: '' });
  const counts = { oscillators: 0, noises: 0, resumed: 0, suspended: 0 };
  const ctx = {
    currentTime: 0,
    sampleRate: 8000,
    destination: {},
    createGain: () => node(),
    createBiquadFilter: () => node(),
    createOscillator: () => {
      counts.oscillators++;
      return { ...node(), start: vi.fn(), stop: vi.fn() };
    },
    createBufferSource: () => {
      counts.noises++;
      return { ...node(), buffer: null, start: vi.fn(), stop: vi.fn() };
    },
    createBuffer: (_c: number, n: number) => ({ getChannelData: () => new Float32Array(n) }),
    resume: () => {
      counts.resumed++;
      return Promise.resolve();
    },
    suspend: () => {
      counts.suspended++;
      return Promise.resolve();
    },
  };
  return { ctx: ctx as unknown as AudioContext, counts };
}

afterEach(() => vi.useRealTimers());

describe('AudioService', () => {
  it('stays silent until a tap unlocks it', () => {
    const { ctx, counts } = fakeContext();
    const a = new AudioService({ sound: true, music: false }, () => ctx);
    a.play('ding');
    expect(a.unlocked).toBe(false);
    expect(counts.oscillators).toBe(0);
    a.unlock();
    expect(a.unlocked).toBe(true);
    a.play('ding');
    expect(counts.oscillators).toBeGreaterThan(0);
  });

  it('every sound effect plays without errors', () => {
    const { ctx, counts } = fakeContext();
    const a = new AudioService({ sound: true, music: false }, () => ctx);
    a.unlock();
    const all: Sfx[] = ['tap', 'drop', 'flip', 'ding', 'pour', 'shake', 'trash', 'burn', 'lid', 'cash', 'chime', 'fanfare'];
    for (const s of all) a.play(s);
    expect(counts.oscillators + counts.noises).toBeGreaterThanOrEqual(all.length);
  });

  it('sound off means no effects', () => {
    const { ctx, counts } = fakeContext();
    const a = new AudioService({ sound: true, music: false }, () => ctx);
    a.unlock();
    a.setSound(false);
    a.play('cash');
    expect(counts.oscillators + counts.noises).toBe(0);
  });

  it('music schedules notes while on, and stops when turned off', () => {
    vi.useFakeTimers();
    const { ctx, counts } = fakeContext();
    const a = new AudioService({ sound: false, music: true }, () => ctx);
    a.unlock();
    vi.advanceTimersByTime(100);
    const playing = counts.oscillators;
    expect(playing).toBeGreaterThan(0);
    a.setMusic(false);
    (ctx as unknown as { currentTime: number }).currentTime = 10;
    vi.advanceTimersByTime(1000);
    expect(counts.oscillators).toBe(playing);
  });

  it('no Web Audio (old browser): everything is a quiet no-op', () => {
    const a = new AudioService({ sound: true, music: true }, () => null);
    a.unlock();
    a.play('tap');
    a.setSuspended(true);
    expect(a.unlocked).toBe(false);
  });

  it('pauses with the page', () => {
    const { ctx, counts } = fakeContext();
    const a = new AudioService({ sound: true, music: false }, () => ctx);
    a.unlock();
    a.setSuspended(true);
    a.setSuspended(false);
    expect(counts.suspended).toBe(1);
    expect(counts.resumed).toBe(2);
  });
});
