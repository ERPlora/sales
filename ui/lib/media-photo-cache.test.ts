import { describe, expect, it, vi } from 'vitest';

import { MediaPhotoCache } from './media-photo-cache';

describe('MediaPhotoCache', () => {
  it('deduplicates references, limits concurrency and publishes local object URLs', async () => {
    let active = 0;
    let peak = 0;
    const loader = vi.fn(async (ref: string) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      return new Blob([ref], { type: 'image/webp' });
    });
    const created: string[] = [];
    const cache = new MediaPhotoCache(
      () => ({ fetchMediaBlob: loader }),
      () => undefined,
      () => `blob:photo-${created.push('x')}`,
      () => undefined,
      3,
    );

    await cache.replace(['a.webp', 'b.webp', 'a.webp', 'c.webp', 'd.webp']);

    expect(loader).toHaveBeenCalledTimes(4);
    expect(peak).toBeLessThanOrEqual(3);
    expect(cache.get('a.webp')).toMatch(/^blob:photo-/);
    expect(cache.get('d.webp')).toMatch(/^blob:photo-/);
  });

  it('aborts and revokes the old catalogue, including a stale result that ignored abort', async () => {
    let finishOld: ((blob: Blob) => void) | undefined;
    const loader = vi.fn((ref: string) => ref === 'old.webp'
      ? new Promise<Blob>((resolve) => { finishOld = resolve; })
      : Promise.resolve(new Blob([ref], { type: 'image/webp' })));
    const revoked: string[] = [];
    let n = 0;
    const cache = new MediaPhotoCache(
      () => ({ fetchMediaBlob: loader }),
      () => undefined,
      () => `blob:${++n}`,
      (url) => revoked.push(url),
    );

    const old = cache.replace(['old.webp']);
    await cache.replace(['new.webp']);
    finishOld?.(new Blob(['old'], { type: 'image/webp' }));
    await old;

    expect(cache.get('old.webp')).toBeUndefined();
    expect(cache.get('new.webp')).toBe('blob:1');
    expect(revoked).toContain('blob:2');

    cache.dispose();
    expect(revoked).toContain('blob:1');
  });

  it('drops a corrupt photo without disturbing the rest and ignores non-images', async () => {
    const revoked: string[] = [];
    let n = 0;
    const cache = new MediaPhotoCache(
      () => ({ fetchMediaBlob: async (ref) => new Blob([ref], {
        type: ref.endsWith('.pdf') ? 'application/pdf' : 'image/webp',
      }) }),
      () => undefined,
      (blob) => `blob:${blob.type}:${++n}`,
      (url) => revoked.push(url),
    );

    await cache.replace(['one.webp', 'two.webp', 'not-image.pdf']);
    const two = cache.get('two.webp');
    cache.drop('one.webp');

    expect(cache.get('one.webp')).toBeUndefined();
    expect(cache.get('two.webp')).toBe(two);
    expect(cache.get('not-image.pdf')).toBeUndefined();
    expect(revoked).toHaveLength(1);
  });

  it('ignores a late error from the old URL when the same reference already has a new one', async () => {
    let n = 0;
    const revoked: string[] = [];
    const cache = new MediaPhotoCache(
      () => ({ fetchMediaBlob: async () => new Blob(['x'], { type: 'image/webp' }) }),
      () => undefined,
      () => `blob:${++n}`,
      (url) => revoked.push(url),
    );

    await cache.replace(['same.webp']);
    const oldUrl = cache.get('same.webp')!;
    await cache.replace(['same.webp']);
    const newUrl = cache.get('same.webp')!;
    cache.drop('same.webp', oldUrl);

    expect(cache.get('same.webp')).toBe(newUrl);
    cache.drop('same.webp', newUrl);
    expect(cache.get('same.webp')).toBeUndefined();
    expect(revoked).toEqual([oldUrl, newUrl]);
  });

  it('keeps loading the wall when one media request rejects', async () => {
    const cache = new MediaPhotoCache(
      () => ({
        fetchMediaBlob: async (ref) => {
          if (ref === 'broken.webp') throw new Error('network');
          return new Blob([ref], { type: 'image/webp' });
        },
      }),
      () => undefined,
      () => 'blob:working',
      () => undefined,
      1,
    );

    await expect(cache.replace(['broken.webp', 'working.webp'])).resolves.toBeUndefined();
    expect(cache.get('broken.webp')).toBeUndefined();
    expect(cache.get('working.webp')).toBe('blob:working');
  });
});
