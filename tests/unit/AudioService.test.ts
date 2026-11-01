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
    createDynamicsCompressor: () => ({ ...node(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }),
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
    const all: Sfx[] = ['tap', 'drop', 'flip', 'ding', 'pour', 'shake', 'trash', 'burn', 'lid', 'cash', 'chime', 'fanfare', 'scrub'];
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


  it('a tap wakes it back up if the phone paused it (but not while the page is hidden)', () => {
    const { ctx, counts } = fakeContext();
    const a = new AudioService({ sound: true, music: false }, () => ctx);
    a.unlock();
    const c = ctx as unknown as { state: string };
    c.state = 'running';
    a.wake();
    expect(counts.resumed).toBe(1);
    c.state = 'suspended';
    a.wake();
    expect(counts.resumed).toBe(2);
    a.setSuspended(true);
    a.wake();
    expect(counts.resumed).toBe(2);
  });

  it('audio the phone closed is made afresh on the next tap', () => {
    let made = 0;
    const a = new AudioService({ sound: true, music: false }, () => {
      made++;
      return fakeContext().ctx;
    });
    a.unlock();
    expect(made).toBe(1);
    const ctx = (a as unknown as { ctx: { state: string } }).ctx;
    ctx.state = 'closed';
    a.wake();
    expect(made).toBe(2);
    expect(a.unlocked).toBe(true);
  });

  it('music that fell behind picks up from now instead of a burst of old notes', () => {
    vi.useFakeTimers();
    const { ctx, counts } = fakeContext();
    const a = new AudioService({ sound: true, music: true }, () => ctx);
    a.unlock();
    (ctx as unknown as { currentTime: number }).currentTime = 600;
    vi.advanceTimersByTime(60);
    expect(counts.oscillators).toBeLessThan(20);
  });
});
